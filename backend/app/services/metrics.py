"""Compute all portfolio metrics from daily portfolio data.

Each metric is implemented as a standalone pure function that takes minimal
numeric inputs and returns a value.  ``compute_all_metrics`` is the
orchestrator that calls them to produce the same rolling-metric rows as
before.
"""

import math
import logging
from datetime import date
from typing import Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


# =====================================================================
# Pure metric functions
# =====================================================================

def compute_daily_returns(
    pv: List[float],
    deposits: List[float],
) -> List[float]:
    """Deposit-adjusted daily simple returns.

    First element is always 0.0 (no prior day).
    """
    returns = [0.0]
    for i in range(1, len(pv)):
        new_dep = deposits[i] - deposits[i - 1]
        if pv[i - 1] > 0:
            returns.append((pv[i] - pv[i - 1] - new_dep) / pv[i - 1])
        else:
            returns.append(0.0)
    return returns


def compute_cumulative_return(pv_i: float, deposits_i: float) -> float:
    """Cumulative return as a decimal: (value − deposits) / deposits."""
    if deposits_i > 0:
        return (pv_i - deposits_i) / deposits_i
    return 0.0


def compute_twr(daily_returns: List[float]) -> float:
    """Time-weighted return (chain-linked) as a decimal.

    *daily_returns* should include the leading 0.0 for day-0; returns after
    index 0 are compounded.
    """
    twr = 1.0
    for r in daily_returns[1:]:
        twr *= (1 + r)
    return twr - 1.0


def compute_mwr(
    dates_list: List[date],
    pv_list: List[float],
    ext_flows: Dict[date, float],
) -> Tuple[float, float]:
    """Money-weighted return via Modified Dietz.

    Returns ``(annualized_mwr, period_mwr)`` as decimals.
    Falls back to ``(0, 0)`` on degenerate inputs.
    """
    if len(dates_list) < 2:
        return 0.0, 0.0

    d0, dn = dates_list[0], dates_list[-1]
    total_days = (dn - d0).days
    if total_days <= 0:
        return 0.0, 0.0

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
        return 0.0, 0.0

    mdr = (pv_end - pv_start - total_flow) / denom

    annualized = mdr
    if total_days > 0:
        years = total_days / 365.25
        if mdr > -1:
            annualized = (1 + mdr) ** (1 / years) - 1
    return annualized, mdr


def compute_cagr(pv_start: float, pv_end: float, days_elapsed: int) -> float:
    """Compound annual growth rate as a decimal."""
    if days_elapsed <= 0 or pv_start <= 0 or pv_end <= 0:
        return 0.0
    years = days_elapsed / 365.25
    return (pv_end / pv_start) ** (1 / years) - 1


def compute_annualized_return(twr_decimal: float, days_elapsed: int) -> float:
    """Simple annualized return: TWR percentage spread over years."""
    if days_elapsed <= 0:
        return 0.0
    years = days_elapsed / 365.25
    return (twr_decimal * 100) * (1 / years)


def compute_drawdown(pv_series: List[float]) -> Tuple[float, float]:
    """Max drawdown and current drawdown as decimals (negative values).

    Returns ``(max_drawdown, current_drawdown)``.
    """
    if not pv_series:
        return 0.0, 0.0
    peak = pv_series[0]
    max_dd = 0.0
    for v in pv_series:
        if v > peak:
            peak = v
        dd = (v / peak - 1) if peak > 0 else 0.0
        if dd < max_dd:
            max_dd = dd
    current_peak = max(pv_series)
    current_dd = (pv_series[-1] / current_peak - 1) if current_peak > 0 else 0.0
    return max_dd, current_dd


def compute_volatility(daily_returns: List[float]) -> float:
    """Annualized volatility as a decimal.

    *daily_returns* should NOT include the leading day-0 zero; pass
    ``daily_returns[1:]``.
    """
    if len(daily_returns) < 2:
        return 0.0
    vol = float(np.std(daily_returns, ddof=1))
    return vol * math.sqrt(252)


def compute_sharpe(daily_returns: List[float], rf_daily: float) -> float:
    """Annualized Sharpe ratio.

    *daily_returns* should NOT include the leading day-0 zero.
    """
    if len(daily_returns) < 2:
        return 0.0
    vol = float(np.std(daily_returns, ddof=1))
    if vol <= 0:
        return 0.0
    excess = [r - rf_daily for r in daily_returns]
    return float(np.mean(excess)) / vol * math.sqrt(252)


def compute_sortino(daily_returns: List[float], rf_daily: float) -> float:
    """Annualized Sortino ratio.

    *daily_returns* should NOT include the leading day-0 zero.
    """
    if len(daily_returns) < 2:
        return 0.0
    downside = [min(r - rf_daily, 0) for r in daily_returns]
    downside_dev = float(np.std(downside, ddof=1)) if len(downside) > 1 else 0.0
    if downside_dev <= 0:
        return 0.0
    excess_mean = float(np.mean([r - rf_daily for r in daily_returns]))
    return excess_mean / downside_dev * math.sqrt(252)


def compute_calmar(annualized_return_pct: float, max_drawdown_pct: float) -> float:
    """Calmar ratio: annualized return / |max drawdown|.

    Both inputs are percentages (e.g. 12.5 for 12.5%).
    """
    abs_dd = abs(max_drawdown_pct)
    if abs_dd <= 0:
        return 0.0
    return annualized_return_pct / abs_dd


def compute_win_loss(daily_returns: List[float]) -> Dict:
    """Win/loss statistics from a list of daily returns (decimals).

    *daily_returns* should NOT include the leading day-0 zero.

    Returns dict with: win_rate, num_wins, num_losses, avg_win, avg_loss,
    best_day, worst_day, profit_factor  (all as decimals except counts).
    """
    if not daily_returns:
        return {
            "win_rate": 0.0, "num_wins": 0, "num_losses": 0,
            "avg_win": 0.0, "avg_loss": 0.0,
            "best_day": 0.0, "worst_day": 0.0, "profit_factor": 0.0,
        }

    pos = [r for r in daily_returns if r > 0]
    neg = [r for r in daily_returns if r < 0]
    num_wins = len(pos)
    num_losses = len(neg)
    decided = num_wins + num_losses

    gross_wins = sum(pos) if pos else 0.0
    gross_losses = abs(sum(neg)) if neg else 0.0

    return {
        "win_rate": (num_wins / decided) if decided > 0 else 0.0,
        "num_wins": num_wins,
        "num_losses": num_losses,
        "avg_win": float(np.mean(pos)) if pos else 0.0,
        "avg_loss": float(np.mean(neg)) if neg else 0.0,
        "best_day": max(daily_returns),
        "worst_day": min(daily_returns),
        "profit_factor": (gross_wins / gross_losses) if gross_losses > 0 else 0.0,
    }


# =====================================================================
# Orchestrator — same signature and output as the original
# =====================================================================

def compute_all_metrics(
    daily_rows: List[Dict],
    cash_flow_events: List[Dict],
    benchmark_closes: Optional[List[Dict]] = None,
    risk_free_rate: float = 0.05,
) -> List[Dict]:
    """Compute rolling metrics for every date in *daily_rows*.

    Parameters
    ----------
    daily_rows : list of dicts with keys ``date``, ``portfolio_value``, ``net_deposits``
    cash_flow_events : list of dicts with keys ``date``, ``amount`` (external flows only)
    benchmark_closes : optional list of dicts with keys ``date``, ``close``
    risk_free_rate : annualized risk-free rate

    Returns
    -------
    list of dicts (one per date) with all metric columns.
    """
    if not daily_rows:
        return []

    n = len(daily_rows)
    pv = [r["portfolio_value"] for r in daily_rows]
    dates = [
        r["date"] if isinstance(r["date"], date) else date.fromisoformat(str(r["date"]))
        for r in daily_rows
    ]
    deposits = [r["net_deposits"] for r in daily_rows]

    # Pre-compute full daily returns series
    daily_rets = compute_daily_returns(pv, deposits)

    # Build external flows lookup for MWR
    ext_flows: Dict[date, float] = {}
    for cf in cash_flow_events:
        d = cf["date"] if isinstance(cf["date"], date) else date.fromisoformat(str(cf["date"]))
        ext_flows[d] = ext_flows.get(d, 0) + cf["amount"]

    rf_daily = (1 + risk_free_rate) ** (1 / 252) - 1

    results: List[Dict] = []
    for i in range(n):
        row: Dict = {"date": dates[i]}
        rets_window = daily_rets[1 : i + 1]  # returns excluding day-0
        days_elapsed = (dates[i] - dates[0]).days

        # --- Basic returns ---
        row["daily_return_pct"] = round(daily_rets[i] * 100, 4)
        row["total_return_dollars"] = round(pv[i] - deposits[i], 2)
        row["cumulative_return_pct"] = round(compute_cumulative_return(pv[i], deposits[i]) * 100, 4)

        # --- TWR ---
        twr_dec = compute_twr(daily_rets[: i + 1])
        row["time_weighted_return"] = round(twr_dec * 100, 4)

        # --- CAGR / Annualized ---
        row["cagr"] = round(compute_cagr(pv[0], pv[i], days_elapsed) * 100, 4)
        row["annualized_return"] = round(compute_annualized_return(twr_dec, days_elapsed), 4)

        # --- MWR ---
        mwr_ann, mwr_period = compute_mwr(dates[: i + 1], pv[: i + 1], ext_flows)
        row["money_weighted_return"] = round(mwr_ann * 100, 4)
        row["money_weighted_return_period"] = round(mwr_period * 100, 4)

        # --- Win / Loss ---
        wl = compute_win_loss(rets_window)
        row["win_rate"] = round(wl["win_rate"] * 100, 2)
        row["num_wins"] = wl["num_wins"]
        row["num_losses"] = wl["num_losses"]
        row["avg_win_pct"] = round(wl["avg_win"] * 100, 4)
        row["avg_loss_pct"] = round(wl["avg_loss"] * 100, 4)

        # --- Drawdown ---
        max_dd, cur_dd = compute_drawdown(pv[: i + 1])
        row["max_drawdown"] = round(max_dd * 100, 4)
        row["current_drawdown"] = round(cur_dd * 100, 4)

        # --- Volatility ---
        row["annualized_volatility"] = round(compute_volatility(rets_window) * 100, 4)

        # --- Sharpe ---
        row["sharpe_ratio"] = round(compute_sharpe(rets_window, rf_daily), 4)

        # --- Sortino ---
        row["sortino_ratio"] = round(compute_sortino(rets_window, rf_daily), 4)

        # --- Calmar ---
        row["calmar_ratio"] = round(
            compute_calmar(row["annualized_return"], row["max_drawdown"]), 4
        ) if days_elapsed > 0 else 0.0

        # --- Best / Worst day ---
        row["best_day_pct"] = round(wl["best_day"] * 100, 4) if rets_window else 0.0
        row["worst_day_pct"] = round(wl["worst_day"] * 100, 4) if rets_window else 0.0

        # --- Profit Factor ---
        row["profit_factor"] = round(wl["profit_factor"], 4)

        results.append(row)

    return results


# =====================================================================
# Chart helper — PerformancePoint[] shape
# =====================================================================

def compute_performance_series(
    daily_rows: List[Dict],
    cash_flow_events: List[Dict],
) -> List[Dict]:
    """Compute performance chart data from daily rows.

    Returns list of dicts with: date, portfolio_value, net_deposits,
    cumulative_return_pct, daily_return_pct, time_weighted_return,
    money_weighted_return, current_drawdown.
    """
    if not daily_rows:
        return []

    pv = [r["portfolio_value"] for r in daily_rows]
    dates = [
        r["date"] if isinstance(r["date"], date) else date.fromisoformat(str(r["date"]))
        for r in daily_rows
    ]
    deposits = [r["net_deposits"] for r in daily_rows]
    daily_rets = compute_daily_returns(pv, deposits)

    ext_flows: Dict[date, float] = {}
    for cf in cash_flow_events:
        d = cf["date"] if isinstance(cf["date"], date) else date.fromisoformat(str(cf["date"]))
        ext_flows[d] = ext_flows.get(d, 0) + cf["amount"]

    results: List[Dict] = []
    twr_cum = 1.0
    peak = 0.0

    for i in range(len(daily_rows)):
        if i > 0:
            twr_cum *= (1 + daily_rets[i])
        peak = max(peak, pv[i])
        dd = ((pv[i] / peak) - 1) if peak > 0 else 0.0

        cum_ret = compute_cumulative_return(pv[i], deposits[i])
        mwr_ann, mwr_period = compute_mwr(dates[: i + 1], pv[: i + 1], ext_flows)

        results.append({
            "date": str(dates[i]),
            "portfolio_value": round(pv[i], 2),
            "net_deposits": round(deposits[i], 2),
            "cumulative_return_pct": round(cum_ret * 100, 4),
            "daily_return_pct": round(daily_rets[i] * 100, 4),
            "time_weighted_return": round((twr_cum - 1) * 100, 4),
            "money_weighted_return": round(mwr_period * 100, 4),
            "current_drawdown": round(dd * 100, 4),
        })

    return results
