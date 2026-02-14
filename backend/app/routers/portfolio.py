"""Portfolio API routes."""

import logging
import time
from datetime import date
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import (
    Account, DailyPortfolio, DailyMetrics, HoldingsHistory,
    Transaction, CashFlow, SyncState, BenchmarkData,
)
from app.schemas import (
    AccountInfo, PortfolioSummary, DailyPortfolioRow,
    HoldingsForDate, HoldingSnapshot, TransactionRow, CashFlowRow,
    PerformancePoint, SyncStatus, ManualCashFlowRequest,
)
from app.services.sync import full_backfill, incremental_update, get_sync_state, set_sync_state
from app.services.metrics import compute_all_metrics, compute_latest_metrics
from app.services.finnhub_market_data import (
    FinnhubAccessError,
    FinnhubError,
    get_daily_closes,
    get_daily_closes_stooq,
    get_latest_price,
)
from app.services.account_scope import resolve_account_ids
from app.services.date_filters import parse_iso_date, resolve_date_range
from app.composer_client import ComposerClient
from app.config import load_accounts, load_finnhub_key, load_polygon_key, load_symphony_export_config, save_symphony_export_path, load_screenshot_config, save_screenshot_config, is_test_mode

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["portfolio"])

# Simple in-memory sync lock
_syncing = False


def _resolve_account_ids(db: Session, account_id: Optional[str]) -> List[str]:
    """Portfolio-scoped account resolution with existing error-message parity."""
    return resolve_account_ids(
        db,
        account_id,
        no_accounts_message="No accounts discovered. Check config.json and restart.",
    )


def _get_client_for_account(db: Session, account_id: str) -> ComposerClient:
    """Build a ComposerClient with the right credentials for a given sub-account."""
    acct = db.query(Account).filter_by(id=account_id).first()
    if not acct:
        raise HTTPException(404, f"Account {account_id} not found")
    accounts_creds = load_accounts()
    for creds in accounts_creds:
        if creds.name == acct.credential_name:
            return ComposerClient.from_credentials(creds)
    raise HTTPException(500, f"No credentials found for credential name '{acct.credential_name}'")


# ------------------------------------------------------------------
# Accounts
# ------------------------------------------------------------------

@router.get("/accounts", response_model=List[AccountInfo])
def list_accounts(db: Session = Depends(get_db)):
    """List all discovered Composer sub-accounts."""
    query = db.query(Account)
    if is_test_mode():
        query = query.filter(Account.credential_name == "__TEST__")
    else:
        query = query.filter(Account.credential_name != "__TEST__")
    rows = query.order_by(Account.credential_name, Account.account_type).all()
    return [
        AccountInfo(
            id=r.id,
            credential_name=r.credential_name,
            account_type=r.account_type,
            display_name=r.display_name,
            status=r.status,
        )
        for r in rows
    ]


# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------

@router.get("/summary", response_model=PortfolioSummary)
def get_summary(
    account_id: Optional[str] = Query(None, description="Sub-account ID or all:<credential_name>"),
    period: Optional[str] = Query(None, description="1D,1W,1M,3M,YTD,1Y,ALL"),
    start_date: Optional[str] = Query(None, description="Custom start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Custom end date YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Portfolio summary with metrics, optionally filtered to a time period."""
    from collections import defaultdict

    ids = _resolve_account_ids(db, account_id)
    date_start, date_end = resolve_date_range(period, start_date, end_date)

    latest_portfolio = db.query(DailyPortfolio).filter(
        DailyPortfolio.account_id.in_(ids)
    ).order_by(DailyPortfolio.date.desc()).first()

    if not latest_portfolio:
        raise HTTPException(404, "No portfolio data. Run sync first.")

    state = get_sync_state(db, ids[0])

    # --- Load daily portfolio rows (all accounts, filtered by date range) ---
    port_query = db.query(DailyPortfolio).filter(
        DailyPortfolio.account_id.in_(ids)
    ).order_by(DailyPortfolio.date)
    if date_start:
        port_query = port_query.filter(DailyPortfolio.date >= date_start)
    if date_end:
        port_query = port_query.filter(DailyPortfolio.date <= date_end)
    all_rows = port_query.all()

    if not all_rows:
        raise HTTPException(404, "No portfolio data for selected period.")

    # --- Build aggregated daily series (handles single + multi account) ---
    per_acct: dict[str, dict[str, DailyPortfolio]] = defaultdict(dict)
    for r in all_rows:
        per_acct[r.account_id][str(r.date)] = r

    all_dates = sorted({str(r.date) for r in all_rows})

    last_vals: dict[str, dict] = {
        aid: {"pv": 0.0, "nd": 0.0, "fees": 0.0, "div": 0.0}
        for aid in per_acct
    }
    daily_series = []  # list of dicts for compute_all_metrics
    fees_series = []
    divs_series = []
    for ds in all_dates:
        sum_pv = sum_nd = sum_fees = sum_div = 0.0
        for aid in per_acct:
            if ds in per_acct[aid]:
                row = per_acct[aid][ds]
                last_vals[aid] = {
                    "pv": row.portfolio_value, "nd": row.net_deposits,
                    "fees": row.total_fees, "div": row.total_dividends,
                }
            sum_pv += last_vals[aid]["pv"]
            sum_nd += last_vals[aid]["nd"]
            sum_fees += last_vals[aid]["fees"]
            sum_div += last_vals[aid]["div"]
        daily_series.append({"date": ds, "portfolio_value": sum_pv, "net_deposits": sum_nd})
        fees_series.append(sum_fees)
        divs_series.append(sum_div)

    # --- Load cash flows for MWR ---
    cf_query = db.query(CashFlow).filter(
        CashFlow.account_id.in_(ids),
        CashFlow.type.in_(["deposit", "withdrawal"]),
    ).order_by(CashFlow.date)
    if date_start:
        cf_query = cf_query.filter(CashFlow.date >= date_start)
    if date_end:
        cf_query = cf_query.filter(CashFlow.date <= date_end)
    cf_dicts = [{"date": cf.date, "amount": cf.amount} for cf in cf_query.all()]

    # --- Compute metrics via shared engine ---
    from app.config import get_settings
    settings = get_settings()
    metrics = compute_all_metrics(daily_series, cf_dicts, risk_free_rate=settings.risk_free_rate)

    if not metrics:
        raise HTTPException(404, "Could not compute metrics for selected period.")

    m = metrics[-1]  # last row has cumulative values for the period

    # Find best/worst day dates and max drawdown date from the computed series
    best_day_date = worst_day_date = max_dd_date = None
    for row in metrics:
        if row["daily_return_pct"] == m["best_day_pct"] and m["best_day_pct"] != 0:
            best_day_date = str(row["date"])
        if row["daily_return_pct"] == m["worst_day_pct"] and m["worst_day_pct"] != 0:
            worst_day_date = str(row["date"])
        if row["current_drawdown"] == m["max_drawdown"] and m["max_drawdown"] != 0 and max_dd_date is None:
            max_dd_date = str(row["date"])

    total_pv = daily_series[-1]["portfolio_value"]
    total_deposits = daily_series[-1]["net_deposits"]

    return PortfolioSummary(
        portfolio_value=round(total_pv, 2),
        net_deposits=round(total_deposits, 2),
        total_return_dollars=round(m.get("total_return_dollars", 0), 2),
        daily_return_pct=round(m.get("daily_return_pct", 0), 4),
        cumulative_return_pct=round(m.get("cumulative_return_pct", 0), 4),
        cagr=round(m.get("cagr", 0), 4),
        annualized_return=round(m.get("annualized_return", 0), 4),
        annualized_return_cum=round(m.get("annualized_return_cum", 0), 4),
        time_weighted_return=round(m.get("time_weighted_return", 0), 4),
        money_weighted_return=round(m.get("money_weighted_return", 0), 4),
        money_weighted_return_period=round(m.get("money_weighted_return_period", 0), 4),
        sharpe_ratio=round(m.get("sharpe_ratio", 0), 4),
        calmar_ratio=round(m.get("calmar_ratio", 0), 4),
        sortino_ratio=round(m.get("sortino_ratio", 0), 4),
        max_drawdown=round(m.get("max_drawdown", 0), 4),
        max_drawdown_date=max_dd_date,
        current_drawdown=round(m.get("current_drawdown", 0), 4),
        win_rate=round(m.get("win_rate", 0), 2),
        num_wins=m.get("num_wins", 0),
        num_losses=m.get("num_losses", 0),
        avg_win_pct=round(m.get("avg_win_pct", 0), 4),
        avg_loss_pct=round(m.get("avg_loss_pct", 0), 4),
        annualized_volatility=round(m.get("annualized_volatility", 0), 4),
        best_day_pct=round(m.get("best_day_pct", 0), 4),
        best_day_date=best_day_date,
        worst_day_pct=round(m.get("worst_day_pct", 0), 4),
        worst_day_date=worst_day_date,
        profit_factor=round(m.get("profit_factor", 0), 4),
        median_drawdown=round(m.get("median_drawdown", 0), 4),
        longest_drawdown_days=m.get("longest_drawdown_days", 0),
        median_drawdown_days=m.get("median_drawdown_days", 0),
        total_fees=round(fees_series[-1], 2),
        total_dividends=round(divs_series[-1], 2),
        last_updated=state.get("last_sync_date"),
    )


# ------------------------------------------------------------------
# Live Summary (intraday overlay)
# ------------------------------------------------------------------

# In-memory cache for the daily series to avoid re-querying DB every 60s
_live_cache: dict = {}  # key: (account_ids_tuple, period, start, end) â†’ {ts, data}
_LIVE_CACHE_TTL = 120  # seconds


@router.get("/summary/live", response_model=PortfolioSummary)
def get_summary_live(
    live_pv: float = Query(..., description="Live portfolio value from symphony data"),
    live_nd: float = Query(..., description="Live net deposits from symphony data"),
    account_id: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Portfolio summary with today's value replaced by live symphony data."""
    from collections import defaultdict
    from app.config import get_settings

    ids = _resolve_account_ids(db, account_id)
    date_start, date_end = resolve_date_range(period, start_date, end_date)
    today = date.today()

    cache_key = (tuple(sorted(ids)), period, start_date, end_date)
    cached = _live_cache.get(cache_key)
    if cached and time.time() - cached["ts"] < _LIVE_CACHE_TTL:
        daily_series = cached["daily_series"]
        cf_dicts = cached["cf_dicts"]
        fees_total = cached["fees_total"]
        divs_total = cached["divs_total"]
        state = cached["state"]
    else:
        state = get_sync_state(db, ids[0])

        port_query = db.query(DailyPortfolio).filter(
            DailyPortfolio.account_id.in_(ids)
        ).order_by(DailyPortfolio.date)
        if date_start:
            port_query = port_query.filter(DailyPortfolio.date >= date_start)
        if date_end:
            port_query = port_query.filter(DailyPortfolio.date <= date_end)
        all_rows = port_query.all()

        if not all_rows:
            raise HTTPException(404, "No portfolio data for selected period.")

        per_acct: dict[str, dict[str, DailyPortfolio]] = defaultdict(dict)
        for r in all_rows:
            per_acct[r.account_id][str(r.date)] = r

        all_dates = sorted({str(r.date) for r in all_rows})

        last_vals: dict[str, dict] = {
            aid: {"pv": 0.0, "nd": 0.0, "fees": 0.0, "div": 0.0}
            for aid in per_acct
        }
        daily_series = []
        fees_series = []
        divs_series = []
        for ds in all_dates:
            sum_pv = sum_nd = sum_fees = sum_div = 0.0
            for aid in per_acct:
                if ds in per_acct[aid]:
                    row = per_acct[aid][ds]
                    last_vals[aid] = {
                        "pv": row.portfolio_value, "nd": row.net_deposits,
                        "fees": row.total_fees, "div": row.total_dividends,
                    }
                sum_pv += last_vals[aid]["pv"]
                sum_nd += last_vals[aid]["nd"]
                sum_fees += last_vals[aid]["fees"]
                sum_div += last_vals[aid]["div"]
            daily_series.append({"date": ds, "portfolio_value": sum_pv, "net_deposits": sum_nd})
            fees_series.append(sum_fees)
            divs_series.append(sum_div)

        fees_total = fees_series[-1] if fees_series else 0.0
        divs_total = divs_series[-1] if divs_series else 0.0

        cf_query = db.query(CashFlow).filter(
            CashFlow.account_id.in_(ids),
            CashFlow.type.in_(["deposit", "withdrawal"]),
        ).order_by(CashFlow.date)
        if date_start:
            cf_query = cf_query.filter(CashFlow.date >= date_start)
        if date_end:
            cf_query = cf_query.filter(CashFlow.date <= date_end)
        cf_dicts = [{"date": cf.date, "amount": cf.amount} for cf in cf_query.all()]

        _live_cache[cache_key] = {
            "ts": time.time(),
            "daily_series": daily_series,
            "cf_dicts": cf_dicts,
            "fees_total": fees_total,
            "divs_total": divs_total,
            "state": state,
        }

    # Deep-copy the series so we don't mutate the cache
    series = [dict(d) for d in daily_series]
    cf = list(cf_dicts)

    # Append or replace today's row with live values
    today_str = str(today)
    if series and series[-1]["date"] == today_str:
        series[-1]["portfolio_value"] = live_pv
        series[-1]["net_deposits"] = live_nd
    else:
        # Infer intraday cash flow from net_deposits delta
        last_nd = series[-1]["net_deposits"] if series else 0.0
        deposit_delta = live_nd - last_nd
        if abs(deposit_delta) > 0.50:
            cf.append({"date": today, "amount": deposit_delta})
        series.append({"date": today_str, "portfolio_value": live_pv, "net_deposits": live_nd})

    settings = get_settings()
    m = compute_latest_metrics(series, cf, risk_free_rate=settings.risk_free_rate)
    if not m:
        raise HTTPException(404, "Could not compute live metrics.")

    # For best/worst day dates we need the full metrics series (use compute_all_metrics)
    # But that's expensive â€” for live updates, skip date lookups and reuse cached dates
    # The live response uses the same shape but without best/worst day dates
    return {
        "portfolio_value": round(live_pv, 2),
        "net_deposits": round(live_nd, 2),
        "total_return_dollars": round(m.get("total_return_dollars", 0), 2),
        "daily_return_pct": round(m.get("daily_return_pct", 0), 4),
        "cumulative_return_pct": round(m.get("cumulative_return_pct", 0), 4),
        "cagr": round(m.get("cagr", 0), 4),
        "annualized_return": round(m.get("annualized_return", 0), 4),
        "annualized_return_cum": round(m.get("annualized_return_cum", 0), 4),
        "time_weighted_return": round(m.get("time_weighted_return", 0), 4),
        "money_weighted_return": round(m.get("money_weighted_return", 0), 4),
        "money_weighted_return_period": round(m.get("money_weighted_return_period", 0), 4),
        "sharpe_ratio": round(m.get("sharpe_ratio", 0), 4),
        "calmar_ratio": round(m.get("calmar_ratio", 0), 4),
        "sortino_ratio": round(m.get("sortino_ratio", 0), 4),
        "max_drawdown": round(m.get("max_drawdown", 0), 4),
        "current_drawdown": round(m.get("current_drawdown", 0), 4),
        "win_rate": round(m.get("win_rate", 0), 2),
        "num_wins": m.get("num_wins", 0),
        "num_losses": m.get("num_losses", 0),
        "avg_win_pct": round(m.get("avg_win_pct", 0), 4),
        "avg_loss_pct": round(m.get("avg_loss_pct", 0), 4),
        "annualized_volatility": round(m.get("annualized_volatility", 0), 4),
        "best_day_pct": round(m.get("best_day_pct", 0), 4),
        "worst_day_pct": round(m.get("worst_day_pct", 0), 4),
        "profit_factor": round(m.get("profit_factor", 0), 4),
        "median_drawdown": round(m.get("median_drawdown", 0), 4),
        "longest_drawdown_days": m.get("longest_drawdown_days", 0),
        "median_drawdown_days": m.get("median_drawdown_days", 0),
        "total_fees": round(fees_total, 2),
        "total_dividends": round(divs_total, 2),
        "last_updated": state.get("last_sync_date"),
    }


# ------------------------------------------------------------------
# Performance
# ------------------------------------------------------------------

@router.get("/performance", response_model=List[PerformancePoint])
def get_performance(
    account_id: Optional[str] = Query(None, description="Sub-account ID or all:<credential_name>"),
    period: Optional[str] = Query(None, description="1D,1W,1M,3M,YTD,1Y,ALL"),
    start_date: Optional[str] = Query(None, description="Custom start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Custom end date YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Performance chart data (portfolio value + deposits + returns over time)."""
    ids = _resolve_account_ids(db, account_id)

    query = db.query(DailyPortfolio, DailyMetrics).outerjoin(
        DailyMetrics,
        (DailyPortfolio.date == DailyMetrics.date) & (DailyPortfolio.account_id == DailyMetrics.account_id),
    ).filter(
        DailyPortfolio.account_id.in_(ids)
    ).order_by(DailyPortfolio.date)

    # Apply date filtering
    d_start, d_end = resolve_date_range(period, start_date, end_date)
    if d_start:
        query = query.filter(DailyPortfolio.date >= d_start)
    if d_end:
        query = query.filter(DailyPortfolio.date <= d_end)

    results = query.all()

    # For single account, return directly
    if len(ids) == 1:
        return [
            {
                "date": str(p.date),
                "portfolio_value": p.portfolio_value,
                "net_deposits": p.net_deposits,
                "cumulative_return_pct": m.cumulative_return_pct if m else 0,
                "daily_return_pct": m.daily_return_pct if m else 0,
                "time_weighted_return": m.time_weighted_return if m else 0,
                "money_weighted_return": getattr(m, "money_weighted_return_period", m.money_weighted_return) if m else 0,
                "current_drawdown": m.current_drawdown if m else 0,
            }
            for p, m in results
        ]

    # Aggregate: sum values per date across sub-accounts with forward-fill.
    # Each account may have different date ranges; forward-fill ensures dates
    # where one account has no row still use its last known values.
    from collections import defaultdict

    fields = [
        "portfolio_value", "net_deposits", "cumulative_return_pct",
        "daily_return_pct", "time_weighted_return", "money_weighted_return",
        "current_drawdown",
    ]
    zeros = {f: 0.0 for f in fields}

    # Build per-account, per-date data
    per_account: dict[str, dict[str, dict]] = defaultdict(dict)
    for p, m in results:
        ds = str(p.date)
        per_account[p.account_id][ds] = {
            "portfolio_value": p.portfolio_value,
            "net_deposits": p.net_deposits,
            "cumulative_return_pct": m.cumulative_return_pct if m else 0,
            "daily_return_pct": m.daily_return_pct if m else 0,
            "time_weighted_return": m.time_weighted_return if m else 0,
            "money_weighted_return": getattr(m, "money_weighted_return_period", m.money_weighted_return) if m else 0,
            "current_drawdown": m.current_drawdown if m else 0,
        }

    # Get the union of all dates, sorted
    all_dates = sorted({ds for acct in per_account.values() for ds in acct})

    # Forward-fill and sum dollar values across accounts per date.
    # Percentage metrics are recalculated from the aggregated dollar values.
    aggregated = []
    last_known: dict[str, dict] = {aid: dict(zeros) for aid in per_account}
    prev_pv = None
    prev_nd = None
    peak_pv = 0.0
    twr_cum = 1.0

    # Also collect per-account MWR for value-weighted average
    last_mwr: dict[str, float] = {aid: 0.0 for aid in per_account}
    last_pv: dict[str, float] = {aid: 0.0 for aid in per_account}

    for ds in all_dates:
        sum_pv = 0.0
        sum_nd = 0.0
        for aid in per_account:
            if ds in per_account[aid]:
                last_known[aid] = per_account[aid][ds]
            sum_pv += last_known[aid]["portfolio_value"]
            sum_nd += last_known[aid]["net_deposits"]
            last_mwr[aid] = last_known[aid]["money_weighted_return"]
            last_pv[aid] = last_known[aid]["portfolio_value"]

        # Cumulative return from dollar values
        cum_ret = ((sum_pv - sum_nd) / sum_nd * 100) if sum_nd else 0

        # Daily return accounting for deposit changes
        if prev_pv is not None and prev_pv > 0:
            cf_today = sum_nd - (prev_nd or 0)
            daily_ret = (sum_pv - prev_pv - cf_today) / prev_pv * 100
        else:
            daily_ret = 0

        # TWR: compound daily returns
        twr_cum *= (1 + daily_ret / 100)
        twr = (twr_cum - 1) * 100

        # Drawdown from deposit-adjusted equity curve (TWR), not raw portfolio value
        peak_pv = max(peak_pv, twr_cum)
        drawdown = ((twr_cum / peak_pv - 1) * 100) if peak_pv > 0 else 0

        # MWR: value-weighted average of per-account MWR
        total_weight = sum(last_pv.values())
        if total_weight > 0:
            mwr = sum(last_mwr[a] * last_pv[a] for a in per_account) / total_weight
        else:
            mwr = 0

        aggregated.append({
            "date": ds,
            "portfolio_value": sum_pv,
            "net_deposits": sum_nd,
            "cumulative_return_pct": round(cum_ret, 4),
            "daily_return_pct": round(daily_ret, 4),
            "time_weighted_return": round(twr, 4),
            "money_weighted_return": round(mwr, 4),
            "current_drawdown": round(drawdown, 4),
        })
        prev_pv = sum_pv
        prev_nd = sum_nd

    return aggregated


# ------------------------------------------------------------------
# Holdings
# ------------------------------------------------------------------

@router.get("/holdings")
def get_holdings(
    account_id: Optional[str] = Query(None, description="Sub-account ID or all:<credential_name>"),
    target_date: Optional[str] = Query(None, alias="date", description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Holdings for a specific date (defaults to latest)."""
    ids = _resolve_account_ids(db, account_id)

    base_query = db.query(HoldingsHistory).filter(HoldingsHistory.account_id.in_(ids))

    rows = []
    latest_date = None
    if target_date:
        d = parse_iso_date(target_date, "date")
        rows = base_query.filter(
            HoldingsHistory.date <= d
        ).order_by(HoldingsHistory.date.desc()).all()
        if rows:
            latest_date = rows[0].date
            rows = [r for r in rows if r.date == latest_date]
        else:
            latest_date = d
    else:
        ld = base_query.with_entities(HoldingsHistory.date).order_by(
            HoldingsHistory.date.desc()
        ).first()
        if ld:
            latest_date = ld[0]
            rows = base_query.filter_by(date=latest_date).all()

    # Fetch notional values from Composer holding-stats for market-value-based allocation
    # For single account, call the API; for aggregate, call each sub-account
    # For __TEST__ accounts, derive values from stored allocation data
    notional_map = {}
    test_ids = {a.id for a in db.query(Account).filter_by(credential_name="__TEST__").all()}
    for aid in ids:
        if aid in test_ids:
            # Compute market values from SymphonyAllocationHistory for test accounts
            from app.models import SymphonyAllocationHistory
            alloc_rows = (
                db.query(SymphonyAllocationHistory)
                .filter_by(account_id=aid)
                .order_by(SymphonyAllocationHistory.date.desc())
                .all()
            )
            if alloc_rows:
                alloc_date = alloc_rows[0].date
                for r in alloc_rows:
                    if r.date == alloc_date and r.value > 0:
                        notional_map[r.ticker] = notional_map.get(r.ticker, 0) + r.value
            continue
        try:
            client = _get_client_for_account(db, aid)
            stats = client.get_holding_stats(aid)
            for h in stats.get("holdings", []):
                sym = h.get("symbol", "")
                if sym and sym != "$USD":
                    notional_map[sym] = notional_map.get(sym, 0) + float(h.get("notional_value", 0))
        except Exception:
            pass  # Fall back to quantity-based if API fails

    # Aggregate holdings by symbol (for multi-account)
    holdings_by_symbol = {}
    for r in rows:
        if r.symbol in holdings_by_symbol:
            holdings_by_symbol[r.symbol]["quantity"] += r.quantity
        else:
            holdings_by_symbol[r.symbol] = {"symbol": r.symbol, "quantity": r.quantity}

    if holdings_by_symbol:
        # Have stored history â€” merge with notional values
        holdings = []
        for sym, h in holdings_by_symbol.items():
            market_value = notional_map.get(sym, 0.0)
            holdings.append({
                "symbol": sym,
                "quantity": h["quantity"],
                "market_value": round(market_value, 2),
            })
    elif notional_map:
        # No stored history but API returned holding stats â€” use API data directly
        holdings = [
            {"symbol": sym, "quantity": 0, "market_value": round(val, 2)}
            for sym, val in notional_map.items()
        ]
        latest_date = date.today()
    else:
        return {"date": str(latest_date) if latest_date else None, "holdings": []}

    total_value = sum(h["market_value"] for h in holdings)
    for h in holdings:
        h["allocation_pct"] = round(h["market_value"] / total_value * 100, 2) if total_value > 0 else 0

    return {"date": str(latest_date), "holdings": holdings}


@router.get("/holdings-history")
def get_holdings_history(
    account_id: Optional[str] = Query(None, description="Sub-account ID"),
    db: Session = Depends(get_db),
):
    """All holdings history dates with position counts."""
    from sqlalchemy import func
    ids = _resolve_account_ids(db, account_id)
    rows = db.query(
        HoldingsHistory.date,
        func.count(HoldingsHistory.symbol).label("num_positions"),
    ).filter(
        HoldingsHistory.account_id.in_(ids)
    ).group_by(HoldingsHistory.date).order_by(HoldingsHistory.date).all()
    return [{"date": str(r.date), "num_positions": r.num_positions} for r in rows]


# ------------------------------------------------------------------
# Transactions
# ------------------------------------------------------------------

@router.get("/transactions")
def get_transactions(
    account_id: Optional[str] = Query(None, description="Sub-account ID or all:<credential_name>"),
    symbol: Optional[str] = None,
    limit: int = Query(100, le=5000),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Transaction history with optional symbol filter."""
    ids = _resolve_account_ids(db, account_id)
    query = db.query(Transaction).filter(
        Transaction.account_id.in_(ids)
    ).order_by(Transaction.date.desc())
    if symbol:
        query = query.filter(Transaction.symbol == symbol.upper())
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    # Build account name lookup
    acct_names = {a.id: a.display_name for a in db.query(Account).filter(Account.id.in_(ids)).all()}
    return {
        "total": total,
        "transactions": [
            {
                "date": str(r.date),
                "symbol": r.symbol,
                "action": r.action,
                "quantity": r.quantity,
                "price": r.price,
                "total_amount": r.total_amount,
                "account_id": r.account_id,
                "account_name": acct_names.get(r.account_id, r.account_id),
            }
            for r in rows
        ],
    }


# ------------------------------------------------------------------
# Cash Flows
# ------------------------------------------------------------------

@router.get("/cash-flows")
def get_cash_flows(
    account_id: Optional[str] = Query(None, description="Sub-account ID or all:<credential_name>"),
    db: Session = Depends(get_db),
):
    """All deposits, fees, and dividends."""
    ids = _resolve_account_ids(db, account_id)
    rows = db.query(CashFlow).filter(
        CashFlow.account_id.in_(ids)
    ).order_by(CashFlow.date).all()
    # Build account name lookup
    acct_names = {a.id: a.display_name for a in db.query(Account).filter(Account.id.in_(ids)).all()}
    return [
        {
            "date": str(r.date),
            "type": r.type,
            "amount": r.amount,
            "description": r.description,
            "account_id": r.account_id,
            "account_name": acct_names.get(r.account_id, r.account_id),
        }
        for r in rows
    ]


@router.post("/cash-flows/manual")
def add_manual_cash_flow(
    body: ManualCashFlowRequest,
    db: Session = Depends(get_db),
):
    """The Composer API does not support automatic cash flow detection for certain account types (e.g. Roth IRAs). Manually add a dated deposit/withdrawal for accounts where reports fail."""
    if body.account_id == "all" or body.account_id.startswith("all:"):
        raise HTTPException(400, "account_id must be a specific sub-account UUID")

    # Reuse account resolution for existence + test-mode visibility validation.
    _resolve_account_ids(db, body.account_id)

    cf_type = body.type if body.type in ("deposit", "withdrawal") else "deposit"
    amount = abs(body.amount) if cf_type == "deposit" else -abs(body.amount)

    db.add(CashFlow(
        account_id=body.account_id,
        date=body.date,
        type=cf_type,
        amount=amount,
        description=body.description or "Manual entry",
    ))
    db.commit()

    # Recalculate portfolio history net_deposits and metrics for this account
    try:
        client = _get_client_for_account(db, body.account_id)
        from app.services.sync import _sync_portfolio_history, _recompute_metrics
        _sync_portfolio_history(db, client, body.account_id)
        _recompute_metrics(db, body.account_id)
    except Exception as e:
        logger.warning("Post-manual-entry recompute failed: %s", e)

    return {"status": "ok", "date": str(body.date), "type": cf_type, "amount": amount}


# ------------------------------------------------------------------
# Sync
# ------------------------------------------------------------------

@router.get("/sync/status", response_model=SyncStatus)
def get_sync_status(
    account_id: Optional[str] = Query(None, description="Sub-account ID"),
    db: Session = Depends(get_db),
):
    """Current sync status."""
    ids = _resolve_account_ids(db, account_id)
    state = get_sync_state(db, ids[0])
    return SyncStatus(
        status="syncing" if _syncing else "idle",
        last_sync_date=state.get("last_sync_date"),
        initial_backfill_done=state.get("initial_backfill_done") == "true",
        message="",
    )


@router.post("/sync")
def trigger_sync(
    account_id: Optional[str] = Query(None, description="Sub-account ID, all:<credential_name>, or omit to sync all"),
    db: Session = Depends(get_db),
):
    """Trigger data sync. Runs backfill on first call, incremental after."""
    global _syncing
    if _syncing:
        return {"status": "already_syncing"}

    _syncing = True
    try:
        # Determine which sub-accounts to sync
        if account_id:
            ids = _resolve_account_ids(db, account_id)
        else:
            # Sync all visible accounts for the current mode.
            ids = _resolve_account_ids(db, "all")

        # Skip __TEST__ accounts (synthetic data, no real Composer credentials)
        test_ids = {a.id for a in db.query(Account).filter_by(credential_name="__TEST__").all()}
        sync_ids = [aid for aid in ids if aid not in test_ids]
        if not sync_ids:
            return {"status": "skipped", "synced_accounts": 0, "reason": "No sync-eligible accounts"}

        for aid in sync_ids:
            client = _get_client_for_account(db, aid)
            state = get_sync_state(db, aid)
            if state.get("initial_backfill_done") == "true":
                incremental_update(db, client, aid)
            else:
                full_backfill(db, client, aid)
            # Rate limit between accounts
            if len(sync_ids) > 1:
                time.sleep(1)

        return {"status": "complete", "synced_accounts": len(sync_ids)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Sync failed: %s", e, exc_info=True)
        raise HTTPException(500, f"Sync failed: {e}")
    finally:
        _syncing = False


@router.get("/config")
def get_app_config():
    """Return client-safe configuration (e.g. Finnhub API key, export settings)."""
    export_cfg = load_symphony_export_config()
    export_status = None
    if export_cfg:
        export_status = {
            "local_path": export_cfg.get("local_path", ""),
        }
    screenshot_cfg = load_screenshot_config()
    return {
        "finnhub_api_key": None,
        "finnhub_configured": load_finnhub_key() is not None,
        "polygon_configured": load_polygon_key() is not None,
        "symphony_export": export_status,
        "screenshot": screenshot_cfg,
        "test_mode": is_test_mode(),
    }


class _SymphonyExportBody(BaseModel):
    local_path: str

@router.post("/config/symphony-export")
def set_symphony_export_config(body: _SymphonyExportBody):
    """Save symphony export local_path from the frontend settings modal."""
    local_path = body.local_path.strip()
    if not local_path:
        raise HTTPException(400, "local_path is required")
    save_symphony_export_path(local_path)
    return {"ok": True, "local_path": local_path}


class _ScreenshotConfigBody(BaseModel):
    local_path: str
    enabled: bool = True
    account_id: str = ""
    chart_mode: str = ""
    period: str = ""
    custom_start: str = ""
    hide_portfolio_value: bool = False
    metrics: List[str] = []
    benchmarks: List[str] = []

@router.post("/config/screenshot")
def set_screenshot_config(body: _ScreenshotConfigBody):
    """Save screenshot configuration from the frontend settings modal."""
    local_path = body.local_path.strip()
    if not local_path:
        raise HTTPException(400, "local_path is required")
    save_screenshot_config(body.model_dump())
    return {"ok": True}


_MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024  # 10 MB

@router.post("/screenshot")
async def upload_screenshot(request: Request):
    """Receive a PNG screenshot and save it to the configured folder."""
    import os
    import re

    cfg = load_screenshot_config()
    if not cfg:
        raise HTTPException(400, "Screenshot not configured")
    local_path = cfg.get("local_path", "")
    if not local_path:
        raise HTTPException(400, "Screenshot save folder not configured")

    form = await request.form()
    file = form.get("file")
    date_str = form.get("date", "")
    if not file:
        raise HTTPException(400, "No file uploaded")

    if not date_str:
        from datetime import date as _date
        date_str = _date.today().isoformat()

    # Validate date_str to prevent path traversal via crafted filenames
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        raise HTTPException(400, "Invalid date format, expected YYYY-MM-DD")

    os.makedirs(local_path, exist_ok=True)
    filename = f"Snapshot_{date_str}.png"
    filepath = os.path.join(local_path, filename)

    contents = await file.read()
    if len(contents) > _MAX_SCREENSHOT_BYTES:
        raise HTTPException(413, f"File too large (max {_MAX_SCREENSHOT_BYTES // 1024 // 1024} MB)")
    with open(filepath, "wb") as f:
        f.write(contents)

    logger.info("Screenshot saved to %s (%d bytes)", filepath, len(contents))
    return {"ok": True, "path": filepath}


# ---------------------------------------------------------------------------
# Benchmark history
# ---------------------------------------------------------------------------

import math
from datetime import datetime as _datetime

_benchmark_cache: Dict[Tuple[str, str, str, str], Tuple[float, list]] = {}  # key -> (timestamp, data)
_BENCHMARK_TTL = 3600  # 1 hour


@router.get("/benchmark-history")
def get_benchmark_history(
    ticker: str = Query(..., description="Ticker symbol, e.g. SPY"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Fetch benchmark price history and compute TWR, drawdown, and MWR series."""
    from app.services.metrics import compute_mwr

    ticker = ticker.strip().upper()
    if not ticker:
        raise HTTPException(400, "Ticker is required")

    if start_date:
        start_dt = parse_iso_date(start_date, "start_date")
    else:
        start_dt = date(2020, 1, 1)
    if end_date:
        end_dt = parse_iso_date(end_date, "end_date")
    else:
        end_dt = date.today()
    if start_dt > end_dt:
        raise HTTPException(400, "start_date cannot be after end_date")

    resolved_account_ids: List[str] = []
    if account_id:
        resolved_account_ids = _resolve_account_ids(db, account_id)

    s_date = str(start_dt)
    e_date = str(end_dt)
    account_scope = ",".join(sorted(resolved_account_ids))
    cache_key = (ticker, s_date, e_date, account_scope)

    # Check cache
    if cache_key in _benchmark_cache:
        ts, cached_data = _benchmark_cache[cache_key]
        if time.time() - ts < _BENCHMARK_TTL:
            return {"ticker": ticker, "data": cached_data}

    # Free historical source: use Stooq for daily history.
    closes: List[Tuple[date, float]] = get_daily_closes_stooq(ticker, start_dt, end_dt)

    # Optional paid source: fallback to Finnhub candles if Stooq has no rows.
    finnhub_error: Optional[str] = None
    if not closes:
        try:
            closes = get_daily_closes(ticker, start_dt, end_dt)
        except FinnhubAccessError as e:
            finnhub_error = str(e)
            logger.warning("Finnhub access denied for %s candles: %s", ticker, e)
        except FinnhubError as e:
            finnhub_error = str(e)
            logger.warning("Finnhub candle request failed for %s: %s", ticker, e)

    # Fallback to DB benchmark_data if external sources returned nothing.
    if not closes:
        db_rows = (
            db.query(BenchmarkData)
            .filter(
                BenchmarkData.symbol == ticker,
                BenchmarkData.date >= start_dt,
                BenchmarkData.date <= end_dt,
            )
            .order_by(BenchmarkData.date)
            .all()
        )
        if db_rows:
            closes = [(r.date, float(r.close)) for r in db_rows]
            logger.info("Benchmark %s: using %d rows from DB fallback", ticker, len(closes))

    if not closes:
        if finnhub_error:
            raise HTTPException(
                502,
                f"Finnhub benchmark data unavailable for '{ticker}': {finnhub_error}",
            )
        raise HTTPException(400, f"No valid price data for '{ticker}'")

    closes.sort(key=lambda x: x[0])

    # Fill today's price if missing (handles pre-market / after-hours gap)
    today = date.today()
    if closes[-1][0] < today <= end_dt:
        try:
            live_price = get_latest_price(ticker)
            if live_price and not math.isnan(live_price):
                closes.append((today, float(live_price)))
            else:
                # Carry forward last close
                closes.append((today, closes[-1][1]))
        except FinnhubError:
            closes.append((today, closes[-1][1]))

    # Compute TWR (cumulative return from first date)
    first_close = closes[0][1]
    twr_series: List[float] = []
    for _, c in closes:
        twr_series.append(round(((c / first_close) - 1) * 100, 4))

    # Compute drawdown series
    peak = first_close
    dd_series: List[float] = []
    for _, c in closes:
        if c > peak:
            peak = c
        dd = ((c / peak) - 1) * 100 if peak > 0 else 0.0
        dd_series.append(round(dd, 4))

    # Compute MWR series (simulate user's cash flows into the benchmark)
    mwr_series: List[float] = [0.0] * len(closes)
    if resolved_account_ids:
        # Load external cash flows for this account scope
        cf_query = db.query(CashFlow).filter(
            CashFlow.account_id.in_(resolved_account_ids),
            func.lower(CashFlow.type).in_(["deposit", "withdrawal"]),
        ).order_by(CashFlow.date).all()

        ext_flows: Dict[date, float] = {}
        for cf in cf_query:
            d = cf.date if isinstance(cf.date, date) else date.fromisoformat(str(cf.date))
            ext_flows[d] = ext_flows.get(d, 0) + cf.amount

        if ext_flows:
            # Pre-compute cumulative shares and hypothetical PV at each date
            shares_acc = 0.0
            hypo_pv_list: List[float] = []
            bench_date_list: List[date] = []

            for bd, bc in closes:
                if bd in ext_flows and bc > 0:
                    shares_acc += ext_flows[bd] / bc
                hypo_pv_list.append(shares_acc * bc if shares_acc > 0 else 0.0)
                bench_date_list.append(bd)

            # Compute rolling MWR using pre-computed PV series
            for i in range(1, len(closes)):
                if hypo_pv_list[i] > 0:
                    try:
                        _, mwr_period = compute_mwr(
                            bench_date_list[: i + 1], hypo_pv_list[: i + 1], ext_flows
                        )
                        mwr_series[i] = round(mwr_period * 100, 4)
                    except Exception:
                        pass

    # Build response
    result = []
    for i, (d, c) in enumerate(closes):
        result.append({
            "date": str(d),
            "close": round(c, 2),
            "return_pct": twr_series[i],
            "drawdown_pct": dd_series[i],
            "mwr_pct": mwr_series[i],
        })

    _benchmark_cache[cache_key] = (time.time(), result)
    return {"ticker": ticker, "data": result}



