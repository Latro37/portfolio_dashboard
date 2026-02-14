"""Portfolio API routes."""

import logging
import time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Account, CashFlow,
)
from app.schemas import (
    AccountInfo, PortfolioSummary, PortfolioHoldingsResponse, HoldingsHistoryRow,
    TransactionListResponse, CashFlowRow, PerformancePoint, BenchmarkHistoryResponse,
    SyncStatus, ManualCashFlowRequest,
)
from app.services.sync import full_backfill, incremental_update, get_sync_state
from app.services.finnhub_market_data import (
    get_daily_closes,
    get_daily_closes_stooq,
    get_latest_price,
)
from app.services.account_scope import resolve_account_ids
from app.services.account_clients import get_client_for_account
from app.services.portfolio_activity_read import (
    get_portfolio_cash_flows_data,
    get_portfolio_transactions_data,
)
from app.services.benchmark_read import get_benchmark_history_data
from app.services.portfolio_holdings_read import (
    get_portfolio_holdings_data,
    get_portfolio_holdings_history_data,
)
from app.services.portfolio_live_overlay import get_portfolio_live_summary_data
from app.services.portfolio_read import get_portfolio_performance_data, get_portfolio_summary_data
from app.config import load_finnhub_key, load_polygon_key, load_symphony_export_config, save_symphony_export_path, load_screenshot_config, save_screenshot_config, is_test_mode

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
    ids = _resolve_account_ids(db, account_id)
    return get_portfolio_summary_data(
        db=db,
        account_ids=ids,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )


# ------------------------------------------------------------------
# Live Summary (intraday overlay)
# ------------------------------------------------------------------

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
    ids = _resolve_account_ids(db, account_id)
    return get_portfolio_live_summary_data(
        db=db,
        account_ids=ids,
        live_pv=live_pv,
        live_nd=live_nd,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )


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
    return get_portfolio_performance_data(
        db=db,
        account_ids=ids,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )


# ------------------------------------------------------------------
# Holdings
# ------------------------------------------------------------------

@router.get("/holdings", response_model=PortfolioHoldingsResponse)
def get_holdings(
    account_id: Optional[str] = Query(None, description="Sub-account ID or all:<credential_name>"),
    target_date: Optional[str] = Query(None, alias="date", description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Holdings for a specific date (defaults to latest)."""
    ids = _resolve_account_ids(db, account_id)
    return get_portfolio_holdings_data(
        db=db,
        account_ids=ids,
        target_date=target_date,
        get_client_for_account_fn=get_client_for_account,
    )

@router.get("/holdings-history", response_model=List[HoldingsHistoryRow])
def get_holdings_history(
    account_id: Optional[str] = Query(None, description="Sub-account ID"),
    db: Session = Depends(get_db),
):
    """All holdings history dates with position counts."""
    ids = _resolve_account_ids(db, account_id)
    return get_portfolio_holdings_history_data(
        db=db,
        account_ids=ids,
    )


# ------------------------------------------------------------------
# Transactions
# ------------------------------------------------------------------

@router.get("/transactions", response_model=TransactionListResponse)
def get_transactions(
    account_id: Optional[str] = Query(None, description="Sub-account ID or all:<credential_name>"),
    symbol: Optional[str] = None,
    limit: int = Query(100, le=5000),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Transaction history with optional symbol filter."""
    ids = _resolve_account_ids(db, account_id)
    return get_portfolio_transactions_data(
        db=db,
        account_ids=ids,
        symbol=symbol,
        limit=limit,
        offset=offset,
    )


# ------------------------------------------------------------------
# Cash Flows
# ------------------------------------------------------------------

@router.get("/cash-flows", response_model=List[CashFlowRow])
def get_cash_flows(
    account_id: Optional[str] = Query(None, description="Sub-account ID or all:<credential_name>"),
    db: Session = Depends(get_db),
):
    """All deposits, fees, and dividends."""
    ids = _resolve_account_ids(db, account_id)
    return get_portfolio_cash_flows_data(
        db=db,
        account_ids=ids,
    )

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
        client = get_client_for_account(db, body.account_id)
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
            client = get_client_for_account(db, aid)
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

@router.get("/benchmark-history", response_model=BenchmarkHistoryResponse)
def get_benchmark_history(
    ticker: str = Query(..., description="Ticker symbol, e.g. SPY"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Fetch benchmark price history and compute TWR, drawdown, and MWR series."""
    return get_benchmark_history_data(
        db=db,
        ticker=ticker,
        start_date=start_date,
        end_date=end_date,
        account_id=account_id,
        get_daily_closes_stooq_fn=get_daily_closes_stooq,
        get_daily_closes_fn=get_daily_closes,
        get_latest_price_fn=get_latest_price,
    )



