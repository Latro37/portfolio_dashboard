"""Portfolio live-summary overlay service."""

from __future__ import annotations

import time
from datetime import date
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.services.date_filters import resolve_date_range
from app.services.metrics import compute_latest_metrics
from app.services.portfolio_read import load_aggregated_daily_series, load_cash_flow_events
from app.services.sync import get_sync_state

_live_cache: Dict[Tuple[tuple[str, ...], Optional[str], Optional[str], Optional[str]], Dict] = {}
_LIVE_CACHE_TTL = 120  # seconds


def invalidate_portfolio_live_cache(*, account_ids: Optional[List[str]] = None) -> int:
    """Invalidate in-memory live-summary cache entries.

    If ``account_ids`` is omitted, clears the full cache.  Otherwise clears any
    cached scope that intersects with one of the provided account IDs.
    Returns the number of removed cache entries.
    """
    if not _live_cache:
        return 0

    if not account_ids:
        removed = len(_live_cache)
        _live_cache.clear()
        return removed

    targets = set(account_ids)
    to_remove = [key for key in _live_cache if set(key[0]) & targets]
    for key in to_remove:
        _live_cache.pop(key, None)
    return len(to_remove)


def get_portfolio_live_summary_data(
    db: Session,
    account_ids: List[str],
    live_pv: float,
    live_nd: float,
    period: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
) -> Dict:
    """Compute live summary by replacing/adding today's row before metrics."""
    date_start, date_end = resolve_date_range(period, start_date, end_date)
    today = date.today()

    cache_key = (tuple(sorted(account_ids)), period, start_date, end_date)
    cached = _live_cache.get(cache_key)
    if cached and time.time() - cached["ts"] < _LIVE_CACHE_TTL:
        daily_series = cached["daily_series"]
        cf_dicts = cached["cf_dicts"]
        fees_total = cached["fees_total"]
        dividends_total = cached["dividends_total"]
        state = cached["state"]
    else:
        state = get_sync_state(db, account_ids[0])
        daily_series, fees_total, dividends_total = load_aggregated_daily_series(
            db=db,
            account_ids=account_ids,
            date_start=date_start,
            date_end=date_end,
        )
        cf_dicts = load_cash_flow_events(
            db=db,
            account_ids=account_ids,
            date_start=date_start,
            date_end=date_end,
        )
        _live_cache[cache_key] = {
            "ts": time.time(),
            "daily_series": daily_series,
            "cf_dicts": cf_dicts,
            "fees_total": fees_total,
            "dividends_total": dividends_total,
            "state": state,
        }

    series = [dict(row) for row in daily_series]
    cf = list(cf_dicts)

    today_str = str(today)
    if series and series[-1]["date"] == today_str:
        series[-1]["portfolio_value"] = live_pv
        series[-1]["net_deposits"] = live_nd
    else:
        last_nd = series[-1]["net_deposits"] if series else 0.0
        deposit_delta = live_nd - last_nd
        if abs(deposit_delta) > 0.50:
            cf.append({"date": today, "amount": deposit_delta})
        series.append({"date": today_str, "portfolio_value": live_pv, "net_deposits": live_nd})

    settings = get_settings()
    metric = compute_latest_metrics(series, cf, risk_free_rate=settings.risk_free_rate)
    if not metric:
        raise HTTPException(404, "Could not compute live metrics.")

    return {
        "portfolio_value": round(live_pv, 2),
        "net_deposits": round(live_nd, 2),
        "total_return_dollars": round(metric.get("total_return_dollars", 0), 2),
        "daily_return_pct": round(metric.get("daily_return_pct", 0), 4),
        "cumulative_return_pct": round(metric.get("cumulative_return_pct", 0), 4),
        "cagr": round(metric.get("cagr", 0), 4),
        "annualized_return": round(metric.get("annualized_return", 0), 4),
        "annualized_return_cum": round(metric.get("annualized_return_cum", 0), 4),
        "time_weighted_return": round(metric.get("time_weighted_return", 0), 4),
        "money_weighted_return": round(metric.get("money_weighted_return", 0), 4),
        "money_weighted_return_period": round(metric.get("money_weighted_return_period", 0), 4),
        "sharpe_ratio": round(metric.get("sharpe_ratio", 0), 4),
        "calmar_ratio": round(metric.get("calmar_ratio", 0), 4),
        "sortino_ratio": round(metric.get("sortino_ratio", 0), 4),
        "max_drawdown": round(metric.get("max_drawdown", 0), 4),
        "current_drawdown": round(metric.get("current_drawdown", 0), 4),
        "win_rate": round(metric.get("win_rate", 0), 2),
        "num_wins": metric.get("num_wins", 0),
        "num_losses": metric.get("num_losses", 0),
        "avg_win_pct": round(metric.get("avg_win_pct", 0), 4),
        "avg_loss_pct": round(metric.get("avg_loss_pct", 0), 4),
        "annualized_volatility": round(metric.get("annualized_volatility", 0), 4),
        "best_day_pct": round(metric.get("best_day_pct", 0), 4),
        "worst_day_pct": round(metric.get("worst_day_pct", 0), 4),
        "profit_factor": round(metric.get("profit_factor", 0), 4),
        "median_drawdown": round(metric.get("median_drawdown", 0), 4),
        "longest_drawdown_days": metric.get("longest_drawdown_days", 0),
        "median_drawdown_days": metric.get("median_drawdown_days", 0),
        "total_fees": round(fees_total, 2),
        "total_dividends": round(dividends_total, 2),
        "last_updated": state.get("last_sync_date"),
    }
