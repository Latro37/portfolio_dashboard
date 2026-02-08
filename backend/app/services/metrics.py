"""Compute all portfolio metrics from daily portfolio data."""

import math
import logging
from datetime import date, timedelta
from typing import Dict, List, Optional

import numpy as np
from scipy.optimize import brentq

logger = logging.getLogger(__name__)


def compute_all_metrics(
    daily_rows: List[Dict],
    cash_flow_events: List[Dict],
    benchmark_closes: Optional[List[Dict]] = None,
    risk_free_rate: float = 0.05,
) -> List[Dict]:
    """Compute rolling metrics for every date in daily_rows.

    Parameters
    ----------
    daily_rows : list of dicts with keys: date, portfolio_value, net_deposits
    cash_flow_events : list of dicts with keys: date, amount (external flows only: deposits/withdrawals)
    benchmark_closes : optional list of dicts with keys: date, close
    risk_free_rate : annualized risk-free rate

    Returns
    -------
    list of dicts (one per date) with all metric columns.
    """
    if not daily_rows:
        return []

    n = len(daily_rows)
    pv = [r["portfolio_value"] for r in daily_rows]
    dates = [r["date"] if isinstance(r["date"], date) else date.fromisoformat(str(r["date"])) for r in daily_rows]
    deposits = [r["net_deposits"] for r in daily_rows]

    # Build daily external flows lookup for MWR
    ext_flows: Dict[date, float] = {}
    for cf in cash_flow_events:
        d = cf["date"] if isinstance(cf["date"], date) else date.fromisoformat(str(cf["date"]))
        ext_flows[d] = ext_flows.get(d, 0) + cf["amount"]

    # Daily simple returns
    daily_returns = [0.0]
    for i in range(1, n):
        new_dep = deposits[i] - deposits[i - 1]
        if pv[i - 1] > 0:
            daily_returns.append((pv[i] - pv[i - 1] - new_dep) / pv[i - 1])
        else:
            daily_returns.append(0.0)

    # Benchmark daily returns (for Sharpe, Sortino)
    bench_returns = None
    if benchmark_closes and len(benchmark_closes) >= 2:
        bench_by_date = {
            (bc["date"] if isinstance(bc["date"], date) else date.fromisoformat(str(bc["date"]))): bc["close"]
            for bc in benchmark_closes
        }
        bench_returns = []
        for d in dates:
            bench_returns.append(bench_by_date.get(d))

    rf_daily = (1 + risk_free_rate) ** (1 / 252) - 1

    results = []
    for i in range(n):
        row = {"date": dates[i]}
        rets_so_far = daily_returns[: i + 1]
        pos_rets = [r for r in rets_so_far[1:] if r > 0]
        neg_rets = [r for r in rets_so_far[1:] if r < 0]
        trading_days = len(rets_so_far) - 1  # exclude first day

        # --- Basic returns ---
        row["daily_return_pct"] = round(daily_returns[i] * 100, 4)
        row["total_return_dollars"] = round(pv[i] - deposits[i], 2)

        # Cumulative return
        if deposits[i] > 0:
            row["cumulative_return_pct"] = round((pv[i] - deposits[i]) / deposits[i] * 100, 4)
        else:
            row["cumulative_return_pct"] = 0.0

        # --- Time-Weighted Return (chain-linked daily returns) ---
        twr = 1.0
        for r in rets_so_far[1:]:
            twr *= (1 + r)
        row["time_weighted_return"] = round((twr - 1) * 100, 4)

        # --- CAGR / Annualized return ---
        # Annualize the TWR for a meaningful CAGR
        days_elapsed = (dates[i] - dates[0]).days
        if days_elapsed > 0 and twr > 0:
            years = days_elapsed / 365.25
            row["cagr"] = round((twr ** (1 / years) - 1) * 100, 4)
            row["annualized_return"] = row["cagr"]
        else:
            row["cagr"] = 0.0
            row["annualized_return"] = 0.0

        # --- Money-Weighted Return (XIRR approximation) ---
        row["money_weighted_return"] = round(_compute_mwr(dates[: i + 1], pv[: i + 1], ext_flows) * 100, 4)

        # --- Win / Loss ---
        num_wins = len(pos_rets)
        num_losses = len(neg_rets)
        total_decided = num_wins + num_losses
        row["win_rate"] = round(num_wins / total_decided * 100, 2) if total_decided > 0 else 0.0
        row["num_wins"] = num_wins
        row["num_losses"] = num_losses
        row["avg_win_pct"] = round(np.mean(pos_rets) * 100, 4) if pos_rets else 0.0
        row["avg_loss_pct"] = round(np.mean(neg_rets) * 100, 4) if neg_rets else 0.0

        # --- Drawdown ---
        peak = max(pv[: i + 1])
        row["max_drawdown"] = round((min(pv[j] / max(pv[: j + 1]) - 1 for j in range(i + 1))) * 100, 4)
        row["current_drawdown"] = round((pv[i] / peak - 1) * 100, 4) if peak > 0 else 0.0

        # --- Volatility ---
        if trading_days >= 2:
            vol = float(np.std(rets_so_far[1:], ddof=1))
            row["annualized_volatility"] = round(vol * math.sqrt(252) * 100, 4)
        else:
            vol = 0.0
            row["annualized_volatility"] = 0.0

        # --- Sharpe Ratio ---
        if trading_days >= 2 and vol > 0:
            excess = [r - rf_daily for r in rets_so_far[1:]]
            row["sharpe_ratio"] = round(float(np.mean(excess)) / vol * math.sqrt(252), 4)
        else:
            row["sharpe_ratio"] = 0.0

        # --- Sortino Ratio ---
        if trading_days >= 2:
            downside = [min(r - rf_daily, 0) for r in rets_so_far[1:]]
            downside_dev = float(np.std(downside, ddof=1)) if len(downside) > 1 else 0.0
            if downside_dev > 0:
                excess_mean = float(np.mean([r - rf_daily for r in rets_so_far[1:]]))
                row["sortino_ratio"] = round(excess_mean / downside_dev * math.sqrt(252), 4)
            else:
                row["sortino_ratio"] = 0.0
        else:
            row["sortino_ratio"] = 0.0

        # --- Calmar Ratio ---
        max_dd = abs(row["max_drawdown"])
        if max_dd > 0 and days_elapsed > 0:
            ann_ret = row["annualized_return"]
            row["calmar_ratio"] = round(ann_ret / max_dd, 4)
        else:
            row["calmar_ratio"] = 0.0

        # --- Best / Worst day ---
        if trading_days >= 1:
            row["best_day_pct"] = round(max(rets_so_far[1:]) * 100, 4)
            row["worst_day_pct"] = round(min(rets_so_far[1:]) * 100, 4)
        else:
            row["best_day_pct"] = 0.0
            row["worst_day_pct"] = 0.0

        # --- Profit Factor ---
        gross_wins = sum(pos_rets) if pos_rets else 0.0
        gross_losses = abs(sum(neg_rets)) if neg_rets else 0.0
        row["profit_factor"] = round(gross_wins / gross_losses, 4) if gross_losses > 0 else 0.0

        results.append(row)

    return results


def _compute_mwr(
    dates_list: List[date],
    pv_list: List[float],
    ext_flows: Dict[date, float],
) -> float:
    """Approximate money-weighted return via modified Dietz or simple XIRR.

    Falls back to 0 if solver fails.
    """
    if len(dates_list) < 2:
        return 0.0

    d0 = dates_list[0]
    dn = dates_list[-1]
    total_days = (dn - d0).days
    if total_days <= 0:
        return 0.0

    # Modified Dietz method
    pv_start = pv_list[0]
    pv_end = pv_list[-1]
    total_flow = 0.0
    weighted_flow = 0.0

    for d, amt in ext_flows.items():
        if d0 <= d <= dn:
            total_flow += amt
            w = (dn - d).days / total_days
            weighted_flow += amt * w

    denom = pv_start + weighted_flow
    if abs(denom) < 1e-6:
        return 0.0

    mdr = (pv_end - pv_start - total_flow) / denom
    # Annualize
    if total_days > 0:
        years = total_days / 365.25
        if mdr > -1:
            return (1 + mdr) ** (1 / years) - 1
    return mdr
