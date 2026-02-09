"""Portfolio API routes."""

import logging
import time
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Account, DailyPortfolio, DailyMetrics, HoldingsHistory,
    Transaction, CashFlow, SyncState,
)
from app.schemas import (
    AccountInfo, PortfolioSummary, DailyPortfolioRow, DailyMetricsRow,
    HoldingsForDate, HoldingSnapshot, TransactionRow, CashFlowRow,
    PerformancePoint, SyncStatus, ManualCashFlowRequest,
)
from app.services.sync import full_backfill, incremental_update, get_sync_state, set_sync_state
from app.services.metrics import compute_all_metrics
from app.composer_client import ComposerClient
from app.config import load_accounts

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["portfolio"])

# Simple in-memory sync lock
_syncing = False


def _resolve_date_range(
    period: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> tuple[Optional[date], Optional[date]]:
    """Convert period preset or custom range to (start, end) dates."""
    if start_date or end_date:
        return (
            date.fromisoformat(start_date) if start_date else None,
            date.fromisoformat(end_date) if end_date else None,
        )
    if period and period != "ALL":
        today = date.today()
        offsets = {
            "1D": timedelta(days=1),
            "1W": timedelta(weeks=1),
            "1M": timedelta(days=30),
            "3M": timedelta(days=90),
            "1Y": timedelta(days=365),
        }
        if period == "YTD":
            return (date(today.year, 1, 1), None)
        if period in offsets:
            return (today - offsets[period], None)
    return (None, None)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _resolve_account_ids(db: Session, account_id: Optional[str]) -> List[str]:
    """Resolve an account_id param to a list of sub-account IDs.

    - None → first discovered sub-account (backward compat)
    - specific UUID → [that UUID]
    - "all" → every sub-account across all credentials
    - "all:<credential_name>" → all sub-accounts for that credential
    """
    if account_id == "all":
        accts = db.query(Account).all()
        if not accts:
            raise HTTPException(404, "No accounts discovered. Check accounts.json and restart.")
        return [a.id for a in accts]
    if account_id and account_id.startswith("all:"):
        cred_name = account_id[4:]
        accts = db.query(Account).filter_by(credential_name=cred_name).all()
        if not accts:
            raise HTTPException(404, f"No sub-accounts found for credential '{cred_name}'")
        return [a.id for a in accts]
    if account_id:
        return [account_id]
    # Default: first discovered account
    first = db.query(Account).first()
    if not first:
        raise HTTPException(404, "No accounts discovered. Check accounts.json and restart.")
    return [first.id]


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
    rows = db.query(Account).order_by(Account.credential_name, Account.account_type).all()
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
    date_start, date_end = _resolve_date_range(period, start_date, end_date)

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
        total_fees=round(fees_series[-1], 2),
        total_dividends=round(divs_series[-1], 2),
        last_updated=state.get("last_sync_date"),
    )


# ------------------------------------------------------------------
# Performance
# ------------------------------------------------------------------

@router.get("/performance")
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
    d_start, d_end = _resolve_date_range(period, start_date, end_date)
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
# Metrics
# ------------------------------------------------------------------

@router.get("/metrics")
def get_metrics(
    account_id: Optional[str] = Query(None, description="Sub-account ID"),
    db: Session = Depends(get_db),
):
    """All daily metrics."""
    ids = _resolve_account_ids(db, account_id)
    rows = db.query(DailyMetrics).filter(
        DailyMetrics.account_id.in_(ids)
    ).order_by(DailyMetrics.date).all()
    return [
        {c.name: getattr(r, c.name) for c in DailyMetrics.__table__.columns}
        for r in rows
    ]


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

    if target_date:
        d = date.fromisoformat(target_date)
        rows = base_query.filter(
            HoldingsHistory.date <= d
        ).order_by(HoldingsHistory.date.desc()).all()
        if rows:
            latest_date = rows[0].date
            rows = [r for r in rows if r.date == latest_date]
        else:
            return {"date": target_date, "holdings": []}
    else:
        latest_date = base_query.with_entities(HoldingsHistory.date).order_by(
            HoldingsHistory.date.desc()
        ).first()
        if not latest_date:
            return {"date": None, "holdings": []}
        latest_date = latest_date[0]
        rows = base_query.filter_by(date=latest_date).all()

    # Fetch notional values from Composer holding-stats for market-value-based allocation
    # For single account, call the API; for aggregate, call each sub-account
    notional_map = {}
    for aid in ids:
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

    holdings = []
    for sym, h in holdings_by_symbol.items():
        market_value = notional_map.get(sym, 0.0)
        holdings.append({
            "symbol": sym,
            "quantity": h["quantity"],
            "market_value": round(market_value, 2),
        })

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
            # Sync all discovered accounts
            all_accts = db.query(Account).all()
            if not all_accts:
                raise HTTPException(404, "No accounts discovered. Check accounts.json and restart.")
            ids = [a.id for a in all_accts]

        for aid in ids:
            client = _get_client_for_account(db, aid)
            state = get_sync_state(db, aid)
            if state.get("initial_backfill_done") == "true":
                incremental_update(db, client, aid)
            else:
                full_backfill(db, client, aid)
            # Rate limit between accounts
            if len(ids) > 1:
                time.sleep(1)

        return {"status": "complete", "synced_accounts": len(ids)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Sync failed: %s", e, exc_info=True)
        raise HTTPException(500, f"Sync failed: {e}")
    finally:
        _syncing = False
