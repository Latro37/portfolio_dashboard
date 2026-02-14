"""Symphony read/query services for performance and summary endpoints."""

from __future__ import annotations

import time
from datetime import date, timedelta
from typing import Callable, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import SymphonyDailyMetrics, SymphonyDailyPortfolio
from app.services.date_filters import parse_iso_date
from app.services.metrics import compute_all_metrics, compute_latest_metrics

_sym_live_cache: dict = {}  # key: (symphony_id, account_id, period, start, end) -> {ts, data}
_SYM_LIVE_CACHE_TTL = 120  # seconds


def _period_cutoff(period: str, end_date: date) -> Optional[date]:
    mapping = {
        "1D": timedelta(days=1),
        "1W": timedelta(weeks=1),
        "1M": timedelta(days=30),
        "3M": timedelta(days=91),
        "6M": timedelta(days=182),
        "1Y": timedelta(days=365),
    }
    if period == "YTD":
        return date(end_date.year, 1, 1)
    delta = mapping.get(period)
    if delta:
        return end_date - delta
    return None


def _load_filtered_rows(
    db: Session,
    symphony_id: str,
    account_id: str,
    period: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
) -> List[SymphonyDailyPortfolio]:
    rows = db.query(SymphonyDailyPortfolio).filter_by(
        account_id=account_id,
        symphony_id=symphony_id,
    ).order_by(SymphonyDailyPortfolio.date).all()

    if not rows:
        raise HTTPException(404, "No stored data for this symphony. Run sync first.")

    if start_date or end_date:
        sd = parse_iso_date(start_date, "start_date") if start_date else None
        ed = parse_iso_date(end_date, "end_date") if end_date else None
        if sd and ed and sd > ed:
            raise HTTPException(400, "start_date cannot be after end_date")
        rows = [row for row in rows if (sd is None or row.date >= sd) and (ed is None or row.date <= ed)]
    elif period and period != "ALL":
        all_dates = [row.date for row in rows]
        if all_dates:
            cutoff = _period_cutoff(period, all_dates[-1])
            if cutoff:
                rows = [row for row in rows if row.date >= cutoff]

    if not rows:
        raise HTTPException(404, "No data in selected period.")
    return rows


def _build_symphony_cash_flows(rows: List[SymphonyDailyPortfolio]) -> List[Dict]:
    cash_flows: List[Dict] = []
    for i in range(1, len(rows)):
        delta = rows[i].net_deposits - rows[i - 1].net_deposits
        if abs(delta) > 0.50:
            cash_flows.append({"date": rows[i].date, "amount": delta})
    return cash_flows


def _symphony_performance_live(
    db: Session,
    symphony_id: str,
    account_id: str,
    get_client_for_account_fn: Callable[[Session, str], object],
) -> List[Dict]:
    from app.services.metrics import compute_performance_series
    from app.services.sync import _infer_net_deposits_from_history

    client = get_client_for_account_fn(db, account_id)
    try:
        history = client.get_symphony_history(account_id, symphony_id)
    except Exception as exc:
        raise HTTPException(500, f"Failed to fetch symphony history: {exc}")

    if not history:
        return []

    net_deps = _infer_net_deposits_from_history(history)
    daily_rows = []
    for idx, point in enumerate(history):
        daily_rows.append(
            {
                "date": point["date"],
                "portfolio_value": point["value"],
                "net_deposits": net_deps[idx],
            }
        )
    return compute_performance_series(daily_rows, [])


def get_symphony_performance_data(
    db: Session,
    symphony_id: str,
    account_id: str,
    get_client_for_account_fn: Callable[[Session, str], object],
) -> List[Dict]:
    rows = (
        db.query(SymphonyDailyPortfolio, SymphonyDailyMetrics)
        .outerjoin(
            SymphonyDailyMetrics,
            (SymphonyDailyPortfolio.account_id == SymphonyDailyMetrics.account_id)
            & (SymphonyDailyPortfolio.symphony_id == SymphonyDailyMetrics.symphony_id)
            & (SymphonyDailyPortfolio.date == SymphonyDailyMetrics.date),
        )
        .filter(
            SymphonyDailyPortfolio.account_id == account_id,
            SymphonyDailyPortfolio.symphony_id == symphony_id,
        )
        .order_by(SymphonyDailyPortfolio.date)
        .all()
    )

    if not rows:
        return _symphony_performance_live(
            db=db,
            symphony_id=symphony_id,
            account_id=account_id,
            get_client_for_account_fn=get_client_for_account_fn,
        )

    result = []
    for port, met in rows:
        result.append(
            {
                "date": str(port.date),
                "portfolio_value": round(port.portfolio_value, 2),
                "net_deposits": round(port.net_deposits, 2),
                "cumulative_return_pct": round(met.cumulative_return_pct, 4) if met else 0.0,
                "daily_return_pct": round(met.daily_return_pct, 4) if met else 0.0,
                "time_weighted_return": round(met.time_weighted_return, 4) if met else 0.0,
                "money_weighted_return": round(met.money_weighted_return_period, 4) if met else 0.0,
                "current_drawdown": round(met.current_drawdown, 4) if met else 0.0,
            }
        )
    return result


def get_symphony_summary_data(
    db: Session,
    symphony_id: str,
    account_id: str,
    period: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
) -> Dict:
    rows = _load_filtered_rows(
        db=db,
        symphony_id=symphony_id,
        account_id=account_id,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )
    daily_dicts = [
        {"date": row.date, "portfolio_value": row.portfolio_value, "net_deposits": row.net_deposits}
        for row in rows
    ]
    cf_dicts = _build_symphony_cash_flows(rows)

    settings = get_settings()
    metrics = compute_all_metrics(daily_dicts, cf_dicts, None, settings.risk_free_rate)
    if not metrics:
        raise HTTPException(404, "Could not compute metrics.")

    last = metrics[-1]
    first_row = rows[0]
    last_row = rows[-1]
    return {
        "symphony_id": symphony_id,
        "account_id": account_id,
        "period": period or "ALL",
        "start_date": str(first_row.date),
        "end_date": str(last_row.date),
        "portfolio_value": round(last_row.portfolio_value, 2),
        "net_deposits": round(last_row.net_deposits, 2),
        "total_return_dollars": last.get("total_return_dollars", 0),
        "cumulative_return_pct": last.get("cumulative_return_pct", 0),
        "time_weighted_return": last.get("time_weighted_return", 0),
        "money_weighted_return": last.get("money_weighted_return", 0),
        "money_weighted_return_period": last.get("money_weighted_return_period", 0),
        "cagr": last.get("cagr", 0),
        "annualized_return": last.get("annualized_return", 0),
        "annualized_return_cum": last.get("annualized_return_cum", 0),
        "sharpe_ratio": last.get("sharpe_ratio", 0),
        "sortino_ratio": last.get("sortino_ratio", 0),
        "calmar_ratio": last.get("calmar_ratio", 0),
        "max_drawdown": last.get("max_drawdown", 0),
        "current_drawdown": last.get("current_drawdown", 0),
        "annualized_volatility": last.get("annualized_volatility", 0),
        "win_rate": last.get("win_rate", 0),
        "num_wins": last.get("num_wins", 0),
        "num_losses": last.get("num_losses", 0),
        "best_day_pct": last.get("best_day_pct", 0),
        "worst_day_pct": last.get("worst_day_pct", 0),
        "profit_factor": last.get("profit_factor", 0),
        "daily_return_pct": last.get("daily_return_pct", 0),
    }


def get_symphony_summary_live_data(
    db: Session,
    symphony_id: str,
    live_pv: float,
    live_nd: float,
    account_id: str,
    period: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
) -> Dict:
    today = date.today()
    today_str = str(today)
    cache_key = (symphony_id, account_id, period, start_date, end_date)
    cached = _sym_live_cache.get(cache_key)

    if cached and time.time() - cached["ts"] < _SYM_LIVE_CACHE_TTL:
        daily_dicts = cached["daily_dicts"]
        cf_dicts = cached["cf_dicts"]
        first_date_str = cached["first_date_str"]
    else:
        rows = _load_filtered_rows(
            db=db,
            symphony_id=symphony_id,
            account_id=account_id,
            period=period,
            start_date=start_date,
            end_date=end_date,
        )
        daily_dicts = [
            {"date": row.date, "portfolio_value": row.portfolio_value, "net_deposits": row.net_deposits}
            for row in rows
        ]
        cf_dicts = _build_symphony_cash_flows(rows)
        first_date_str = str(rows[0].date)
        _sym_live_cache[cache_key] = {
            "ts": time.time(),
            "daily_dicts": daily_dicts,
            "cf_dicts": cf_dicts,
            "first_date_str": first_date_str,
        }

    series = [dict(d) for d in daily_dicts]
    cf = list(cf_dicts)

    if series and str(series[-1]["date"]) == today_str:
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
        "symphony_id": symphony_id,
        "account_id": account_id,
        "period": period or "ALL",
        "start_date": first_date_str,
        "end_date": today_str,
        "portfolio_value": round(live_pv, 2),
        "net_deposits": round(live_nd, 2),
        "total_return_dollars": metric.get("total_return_dollars", 0),
        "cumulative_return_pct": metric.get("cumulative_return_pct", 0),
        "time_weighted_return": metric.get("time_weighted_return", 0),
        "money_weighted_return": metric.get("money_weighted_return", 0),
        "money_weighted_return_period": metric.get("money_weighted_return_period", 0),
        "cagr": metric.get("cagr", 0),
        "annualized_return": metric.get("annualized_return", 0),
        "annualized_return_cum": metric.get("annualized_return_cum", 0),
        "sharpe_ratio": metric.get("sharpe_ratio", 0),
        "sortino_ratio": metric.get("sortino_ratio", 0),
        "calmar_ratio": metric.get("calmar_ratio", 0),
        "max_drawdown": metric.get("max_drawdown", 0),
        "current_drawdown": metric.get("current_drawdown", 0),
        "annualized_volatility": metric.get("annualized_volatility", 0),
        "win_rate": metric.get("win_rate", 0),
        "num_wins": metric.get("num_wins", 0),
        "num_losses": metric.get("num_losses", 0),
        "best_day_pct": metric.get("best_day_pct", 0),
        "worst_day_pct": metric.get("worst_day_pct", 0),
        "profit_factor": metric.get("profit_factor", 0),
        "daily_return_pct": metric.get("daily_return_pct", 0),
    }
