"""Portfolio read/query service for summary and performance endpoints."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import CashFlow, DailyPortfolio
from app.schemas import PortfolioSummary
from app.services.date_filters import resolve_date_range
from app.services.metrics import compute_all_metrics, compute_performance_series
from app.services.sync import get_sync_state


def load_aggregated_daily_series(
    db: Session,
    account_ids: List[str],
    date_start: Optional[date],
    date_end: Optional[date],
) -> Tuple[List[Dict], float, float]:
    """Load daily portfolio rows and aggregate across account scope with forward-fill."""
    port_query = db.query(DailyPortfolio).filter(
        DailyPortfolio.account_id.in_(account_ids)
    ).order_by(DailyPortfolio.date)
    if date_start:
        port_query = port_query.filter(DailyPortfolio.date >= date_start)
    if date_end:
        port_query = port_query.filter(DailyPortfolio.date <= date_end)
    all_rows = port_query.all()

    if not all_rows:
        raise HTTPException(404, "No portfolio data for selected period.")

    per_acct: dict[str, dict[str, DailyPortfolio]] = defaultdict(dict)
    for row in all_rows:
        per_acct[row.account_id][str(row.date)] = row

    all_dates = sorted({str(row.date) for row in all_rows})
    last_vals: dict[str, dict] = {
        aid: {"pv": 0.0, "nd": 0.0, "fees": 0.0, "div": 0.0}
        for aid in per_acct
    }

    daily_series: List[Dict] = []
    fees_series: List[float] = []
    dividends_series: List[float] = []
    for ds in all_dates:
        sum_pv = sum_nd = sum_fees = sum_div = 0.0
        for aid in per_acct:
            if ds in per_acct[aid]:
                row = per_acct[aid][ds]
                last_vals[aid] = {
                    "pv": row.portfolio_value,
                    "nd": row.net_deposits,
                    "fees": row.total_fees,
                    "div": row.total_dividends,
                }
            sum_pv += last_vals[aid]["pv"]
            sum_nd += last_vals[aid]["nd"]
            sum_fees += last_vals[aid]["fees"]
            sum_div += last_vals[aid]["div"]
        daily_series.append(
            {
                "date": ds,
                "portfolio_value": sum_pv,
                "net_deposits": sum_nd,
            }
        )
        fees_series.append(sum_fees)
        dividends_series.append(sum_div)

    fees_total = fees_series[-1] if fees_series else 0.0
    dividends_total = dividends_series[-1] if dividends_series else 0.0
    return daily_series, fees_total, dividends_total


def load_cash_flow_events(
    db: Session,
    account_ids: List[str],
    date_start: Optional[date],
    date_end: Optional[date],
) -> List[Dict]:
    """Load external cash-flow events used for MWR calculations."""
    cf_query = db.query(CashFlow).filter(
        CashFlow.account_id.in_(account_ids),
        CashFlow.type.in_(["deposit", "withdrawal"]),
    ).order_by(CashFlow.date)
    if date_start:
        cf_query = cf_query.filter(CashFlow.date >= date_start)
    if date_end:
        cf_query = cf_query.filter(CashFlow.date <= date_end)
    return [{"date": cf.date, "amount": cf.amount} for cf in cf_query.all()]


def get_portfolio_summary_data(
    db: Session,
    account_ids: List[str],
    period: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
) -> PortfolioSummary:
    """Compute portfolio summary payload for the given account scope/date range."""
    date_start, date_end = resolve_date_range(period, start_date, end_date)

    latest_portfolio = db.query(DailyPortfolio).filter(
        DailyPortfolio.account_id.in_(account_ids)
    ).order_by(DailyPortfolio.date.desc()).first()
    if not latest_portfolio:
        raise HTTPException(404, "No portfolio data. Run sync first.")

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

    settings = get_settings()
    metrics = compute_all_metrics(daily_series, cf_dicts, risk_free_rate=settings.risk_free_rate)
    if not metrics:
        raise HTTPException(404, "Could not compute metrics for selected period.")
    last_metric = metrics[-1]

    best_day_date = worst_day_date = max_dd_date = None
    for row in metrics:
        if row["daily_return_pct"] == last_metric["best_day_pct"] and last_metric["best_day_pct"] != 0:
            best_day_date = str(row["date"])
        if row["daily_return_pct"] == last_metric["worst_day_pct"] and last_metric["worst_day_pct"] != 0:
            worst_day_date = str(row["date"])
        if (
            row["current_drawdown"] == last_metric["max_drawdown"]
            and last_metric["max_drawdown"] != 0
            and max_dd_date is None
        ):
            max_dd_date = str(row["date"])

    total_pv = daily_series[-1]["portfolio_value"]
    total_deposits = daily_series[-1]["net_deposits"]

    return PortfolioSummary(
        portfolio_value=round(total_pv, 2),
        net_deposits=round(total_deposits, 2),
        total_return_dollars=round(last_metric.get("total_return_dollars", 0), 2),
        daily_return_pct=round(last_metric.get("daily_return_pct", 0), 4),
        cumulative_return_pct=round(last_metric.get("cumulative_return_pct", 0), 4),
        cagr=round(last_metric.get("cagr", 0), 4),
        annualized_return=round(last_metric.get("annualized_return", 0), 4),
        annualized_return_cum=round(last_metric.get("annualized_return_cum", 0), 4),
        time_weighted_return=round(last_metric.get("time_weighted_return", 0), 4),
        money_weighted_return=round(last_metric.get("money_weighted_return", 0), 4),
        money_weighted_return_period=round(last_metric.get("money_weighted_return_period", 0), 4),
        sharpe_ratio=round(last_metric.get("sharpe_ratio", 0), 4),
        calmar_ratio=round(last_metric.get("calmar_ratio", 0), 4),
        sortino_ratio=round(last_metric.get("sortino_ratio", 0), 4),
        max_drawdown=round(last_metric.get("max_drawdown", 0), 4),
        max_drawdown_date=max_dd_date,
        current_drawdown=round(last_metric.get("current_drawdown", 0), 4),
        win_rate=round(last_metric.get("win_rate", 0), 2),
        num_wins=last_metric.get("num_wins", 0),
        num_losses=last_metric.get("num_losses", 0),
        avg_win_pct=round(last_metric.get("avg_win_pct", 0), 4),
        avg_loss_pct=round(last_metric.get("avg_loss_pct", 0), 4),
        annualized_volatility=round(last_metric.get("annualized_volatility", 0), 4),
        best_day_pct=round(last_metric.get("best_day_pct", 0), 4),
        best_day_date=best_day_date,
        worst_day_pct=round(last_metric.get("worst_day_pct", 0), 4),
        worst_day_date=worst_day_date,
        profit_factor=round(last_metric.get("profit_factor", 0), 4),
        median_drawdown=round(last_metric.get("median_drawdown", 0), 4),
        longest_drawdown_days=last_metric.get("longest_drawdown_days", 0),
        median_drawdown_days=last_metric.get("median_drawdown_days", 0),
        total_fees=round(fees_total, 2),
        total_dividends=round(dividends_total, 2),
        last_updated=state.get("last_sync_date"),
    )


def get_portfolio_performance_data(
    db: Session,
    account_ids: List[str],
    period: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
) -> List[Dict]:
    """Load performance chart series recomputed from the selected date range."""
    date_start, date_end = resolve_date_range(period, start_date, end_date)
    try:
        daily_series, _, _ = load_aggregated_daily_series(
            db=db,
            account_ids=account_ids,
            date_start=date_start,
            date_end=date_end,
        )
    except HTTPException as exc:
        if exc.status_code == 404:
            return []
        raise

    cf_dicts = load_cash_flow_events(
        db=db,
        account_ids=account_ids,
        date_start=date_start,
        date_end=date_end,
    )
    return compute_performance_series(daily_series, cf_dicts)
