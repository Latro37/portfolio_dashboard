"""Portfolio API routes."""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Account,
)
from app.schemas import (
    AccountInfo, PortfolioSummary, PortfolioHoldingsResponse, HoldingsHistoryRow,
    TransactionListResponse, CashFlowRow, PerformancePoint, BenchmarkHistoryResponse,
    SyncStatus, SyncTriggerResponse, ManualCashFlowRequest, ManualCashFlowResponse,
    AppConfigResponse, SaveSymphonyExportResponse, SaveSymphonyExportRequest,
    OkResponse, ScreenshotUploadResponse, SaveScreenshotConfigRequest,
)
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
from app.services.portfolio_admin import (
    add_manual_cash_flow_data,
    get_app_config_data,
    get_sync_status_data,
    save_screenshot_config_data,
    save_symphony_export_config_data,
    trigger_sync_data,
    upload_screenshot_data,
)
from app.config import is_test_mode
from app.security import require_local_auth, require_local_strict_origin

router = APIRouter(prefix="/api", tags=["portfolio"])


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
    period: Optional[str] = Query(None, description="1W,1M,3M,YTD,1Y,ALL"),
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
    period: Optional[str] = Query(None, description="1W,1M,3M,YTD,1Y,ALL"),
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

@router.post(
    "/cash-flows/manual",
    response_model=ManualCashFlowResponse,
    dependencies=[Depends(require_local_auth)],
)
def add_manual_cash_flow(
    body: ManualCashFlowRequest,
    db: Session = Depends(get_db),
):
    """The Composer API does not support automatic cash flow detection for certain account types (e.g. Roth IRAs). Manually add a dated deposit/withdrawal for accounts where reports fail."""
    return add_manual_cash_flow_data(
        db,
        body,
        resolve_account_ids_fn=_resolve_account_ids,
        get_client_for_account_fn=get_client_for_account,
    )


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
    return get_sync_status_data(db, ids[0])


@router.post(
    "/sync",
    response_model=SyncTriggerResponse,
    dependencies=[Depends(require_local_auth)],
)
def trigger_sync(
    account_id: Optional[str] = Query(None, description="Sub-account ID, all:<credential_name>, or omit to sync all"),
    db: Session = Depends(get_db),
):
    """Trigger data sync. Runs backfill on first call, incremental after."""
    return trigger_sync_data(
        db,
        account_id=account_id,
        resolve_account_ids_fn=_resolve_account_ids,
        get_client_for_account_fn=get_client_for_account,
    )


@router.get(
    "/config",
    response_model=AppConfigResponse,
    dependencies=[Depends(require_local_strict_origin)],
)
def get_app_config():
    """Return client-safe configuration (e.g. Finnhub API key, export settings)."""
    return get_app_config_data()

@router.post(
    "/config/symphony-export",
    response_model=SaveSymphonyExportResponse,
    dependencies=[Depends(require_local_auth)],
)
def set_symphony_export_config(body: SaveSymphonyExportRequest):
    """Save symphony export local_path from the frontend settings modal."""
    return save_symphony_export_config_data(body.local_path)

@router.post(
    "/config/screenshot",
    response_model=OkResponse,
    dependencies=[Depends(require_local_auth)],
)
def set_screenshot_config(body: SaveScreenshotConfigRequest):
    """Save screenshot configuration from the frontend settings modal."""
    return save_screenshot_config_data(body.model_dump())

@router.post(
    "/screenshot",
    response_model=ScreenshotUploadResponse,
    dependencies=[Depends(require_local_auth)],
)
async def upload_screenshot(request: Request):
    """Receive a PNG screenshot and save it to the configured folder."""
    return await upload_screenshot_data(request)


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



