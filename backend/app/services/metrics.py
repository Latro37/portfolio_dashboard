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
from scipy.optimize import brentq

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


def _modified_dietz(
    pv_start: float,
    pv_end: float,
    total_days: int,
    ext_flows: Dict[date, float],
    d0: date,
    dn: date,
) -> Tuple[float, float]:
    """Modified Dietz fallback.  Returns ``(annualized, period)``."""
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
    years = total_days / 365.25
    annualized = (1 + mdr) ** (1 / years) - 1 if mdr > -1 else mdr
    return annualized, mdr


def compute_mwr(
    dates_list: List[date],
    pv_list: List[float],
    ext_flows: Dict[date, float],
) -> Tuple[float, float]:
    """Money-weighted return via true IRR (Brentq solver).

    Falls back to Modified Dietz if the solver fails to converge.
    Returns ``(annualized_mwr, period_mwr)`` as decimals.
    """
    if len(dates_list) < 2:
        return 0.0, 0.0

    d0, dn = dates_list[0], dates_list[-1]
    total_days = (dn - d0).days
    if total_days <= 0:
        return 0.0, 0.0

    pv_start = pv_list[0]
    pv_end = pv_list[-1]
    years = total_days / 365.25

    # Collect flows within the window
    flows_in_window: List[Tuple[float, float]] = []  # (years_remaining, amount)
    for d, amt in ext_flows.items():
        if d0 < d <= dn:
            t = (dn - d).days / 365.25
            flows_in_window.append((t, amt))

    # NPV equation: 0 = -pv_start*(1+r)^T - sum(cf*(1+r)^t) + pv_end
    def npv(r: float) -> float:
        total = -pv_start * (1 + r) ** years
        for t, amt in flows_in_window:
            total -= amt * (1 + r) ** t
        total += pv_end
        return total

    try:
        irr = brentq(npv, -0.999, 10.0, maxiter=200, xtol=1e-12)
        period_return = (1 + irr) ** years - 1
        return irr, period_return
    except (ValueError, RuntimeError):
        # Solver failed — fall back to Modified Dietz
        return _modified_dietz(pv_start, pv_end, total_days, ext_flows, d0, dn)


def compute_cagr(pv_start: float, pv_end: float, days_elapsed: int) -> float:
    """Compound annual growth rate as a decimal."""
    if days_elapsed <= 0 or pv_start <= 0 or pv_end <= 0:
        return 0.0
    years = days_elapsed / 365.25
    return (pv_end / pv_start) ** (1 / years) - 1


def compute_annualized_return(twr_decimal: float, days_elapsed: int) -> float:
    """Compound annualized return from cumulative TWR decimal."""
    if days_elapsed <= 0:
        return 0.0
    years = days_elapsed / 365.25
    return ((1 + twr_decimal) ** (1 / years) - 1) * 100


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

    Non-trading days (weekends/holidays with exactly 0.0 return) are
    excluded so that only actual trading-day returns contribute to the
    standard deviation, matching industry convention (√252 annualisation).
    """
    trading = [r for r in daily_returns if r != 0.0]
    if len(trading) < 2:
        return 0.0
    vol = float(np.std(trading, ddof=1))
    return vol * math.sqrt(252)


def compute_sharpe(daily_returns: List[float], rf_daily: float) -> float:
    """Annualized Sharpe ratio.

    *daily_returns* should NOT include the leading day-0 zero.

    Non-trading days (exactly 0.0 return) are excluded so that the
    risk-adjusted ratio reflects actual trading-day performance only.
    """
    trading = [r for r in daily_returns if r != 0.0]
    if len(trading) < 2:
        return 0.0
    vol = float(np.std(trading, ddof=1))
    if vol <= 0:
        return 0.0
    excess = [r - rf_daily for r in trading]
    return float(np.mean(excess)) / vol * math.sqrt(252)


def compute_sortino(daily_returns: List[float], rf_daily: float) -> float:
    """Annualized Sortino ratio.

    *daily_returns* should NOT include the leading day-0 zero.

    Non-trading days (exactly 0.0 return) are excluded so that only
    actual trading-day downside deviation is measured.
    """
    trading = [r for r in daily_returns if r != 0.0]
    if len(trading) < 2:
        return 0.0
    downside = [min(r - rf_daily, 0) for r in trading]
    downside_dev = float(np.std(downside, ddof=1)) if len(downside) > 1 else 0.0
    if downside_dev <= 0:
        return 0.0
    excess_mean = float(np.mean([r - rf_daily for r in trading]))
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
# Single-day metric computation (shared by full + incremental paths)
# =====================================================================

def _compute_row(
    i: int,
    pv: List[float],
    dates: List[date],
    deposits: List[float],
    daily_rets: List[float],
    ext_flows: Dict[date, float],
    rf_daily: float,
) -> Dict:
    """Compute the full metric dict for day *i* given pre-computed arrays.

    This is O(N) for the statistics that need the full returns window
    (volatility, Sharpe, Sortino, win/loss) and O(1) for everything else
    except MWR which is one IRR solve.
    """
    row: Dict = {"date": dates[i]}
    rets_window = daily_rets[1 : i + 1]  # returns excluding day-0
    days_elapsed = (dates[i] - dates[0]).days

    # --- Basic returns ---
    row["daily_return_pct"] = round(daily_rets[i] * 100, 4)
    row["total_return_dollars"] = round(pv[i] - deposits[i], 2)
    row["cumulative_return_pct"] = round(compute_cumulative_return(pv[i], deposits[i]) * 100, 4)

    # --- TWR (chain-link full series) ---
    twr_dec = compute_twr(daily_rets[: i + 1])
    row["time_weighted_return"] = round(twr_dec * 100, 4)

    # --- CAGR / Annualized ---
    row["cagr"] = round(compute_cagr(pv[0], pv[i], days_elapsed) * 100, 4)
    ann_ret = compute_annualized_return(twr_dec, days_elapsed)
    row["annualized_return"] = round(ann_ret, 4)

    # --- MWR (one IRR solve) ---
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

    # --- Drawdown (from deposit-adjusted equity curve, not raw pv) ---
    equity = [1.0]
    for r in daily_rets[1 : i + 1]:
        equity.append(equity[-1] * (1 + r))
    max_dd, cur_dd = compute_drawdown(equity)
    row["max_drawdown"] = round(max_dd * 100, 4)
    row["current_drawdown"] = round(cur_dd * 100, 4)

    # --- Volatility ---
    row["annualized_volatility"] = round(compute_volatility(rets_window) * 100, 4)

    # --- Sharpe ---
    row["sharpe_ratio"] = round(compute_sharpe(rets_window, rf_daily), 4)

    # --- Sortino ---
    row["sortino_ratio"] = round(compute_sortino(rets_window, rf_daily), 4)

    # --- Calmar (full-precision intermediates) ---
    max_dd_full = max_dd * 100
    row["calmar_ratio"] = round(
        compute_calmar(ann_ret, max_dd_full), 4
    ) if days_elapsed > 0 else 0.0

    # --- Best / Worst day ---
    row["best_day_pct"] = round(wl["best_day"] * 100, 4) if rets_window else 0.0
    row["worst_day_pct"] = round(wl["worst_day"] * 100, 4) if rets_window else 0.0

    # --- Profit Factor ---
    row["profit_factor"] = round(wl["profit_factor"], 4)

    return row


def _prepare_arrays(
    daily_rows: List[Dict],
    cash_flow_events: List[Dict],
    risk_free_rate: float,
) -> Tuple[List[float], List[date], List[float], List[float], Dict[date, float], float]:
    """Extract arrays and ext_flows from raw dicts.  Shared setup."""
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

    rf_daily = (1 + risk_free_rate) ** (1 / 252) - 1
    return pv, dates, deposits, daily_rets, ext_flows, rf_daily


# =====================================================================
# Orchestrator — full backfill (computes every day)
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

    pv, dates, deposits, daily_rets, ext_flows, rf_daily = _prepare_arrays(
        daily_rows, cash_flow_events, risk_free_rate
    )

    return [
        _compute_row(i, pv, dates, deposits, daily_rets, ext_flows, rf_daily)
        for i in range(len(daily_rows))
    ]


# =====================================================================
# Incremental — compute only the latest day's metrics
# =====================================================================

def compute_latest_metrics(
    daily_rows: List[Dict],
    cash_flow_events: List[Dict],
    risk_free_rate: float = 0.05,
) -> Optional[Dict]:
    """Compute metrics for only the **last** day in *daily_rows*.

    Uses the full history for statistics (Sharpe, Sortino, volatility,
    win/loss, drawdown) but only runs one IRR solve and one TWR chain-link.
    Returns ``None`` if *daily_rows* is empty.
    """
    if not daily_rows:
        return None

    pv, dates, deposits, daily_rets, ext_flows, rf_daily = _prepare_arrays(
        daily_rows, cash_flow_events, risk_free_rate
    )

    return _compute_row(len(daily_rows) - 1, pv, dates, deposits, daily_rets, ext_flows, rf_daily)


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
    equity_peak = 1.0

    for i in range(len(daily_rows)):
        if i > 0:
            twr_cum *= (1 + daily_rets[i])
        equity_peak = max(equity_peak, twr_cum)
        dd = ((twr_cum / equity_peak) - 1) if equity_peak > 0 else 0.0

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
