"""Symphony API routes."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Account,
)

from app.composer_client import ComposerClient
from app.config import load_accounts
from app.services.backtest_cache import get_symphony_backtest_data
from app.services.symphony_allocations_read import get_symphony_allocations_data
from app.services.symphony_benchmark_read import get_symphony_benchmark_data
from app.services.symphony_catalog import get_symphony_catalog_data
from app.services.symphony_list_read import get_symphonies_list_data
from app.services.symphony_read import (
    get_symphony_performance_data,
    get_symphony_summary_data,
    get_symphony_summary_live_data,
)
from app.services.symphony_trade_preview import (
    get_symphony_trade_preview_data,
    get_trade_preview_data,
)
from app.market_hours import is_within_trading_session
import time

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["symphonies"])

TEST_CREDENTIAL = "__TEST__"


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
# List symphonies
# ------------------------------------------------------------------

@router.get("/symphonies")
def list_symphonies(
    account_id: Optional[str] = Query(None, description="Sub-account ID, all:<cred>, or all"),
    db: Session = Depends(get_db),
):
    """List active symphonies across one or more sub-accounts."""
    return get_symphonies_list_data(
        db=db,
        account_id=account_id,
        get_client_for_account_fn=_get_client_for_account,
        test_credential=TEST_CREDENTIAL,
    )


# ------------------------------------------------------------------
# Symphony catalog (name search for benchmarks)
# ------------------------------------------------------------------

@router.get("/symphony-catalog")
def get_symphony_catalog(
    refresh: bool = Query(False, description="Force refresh from Composer API"),
    db: Session = Depends(get_db),
):
    """Return cached symphony catalog for name search."""
    return get_symphony_catalog_data(db=db, refresh=refresh)


# ------------------------------------------------------------------
# Symphony performance (live daily values)
# ------------------------------------------------------------------

@router.get("/symphonies/{symphony_id}/performance")
def get_symphony_performance(
    symphony_id: str,
    account_id: str = Query(..., description="Sub-account ID that owns this symphony"),
    db: Session = Depends(get_db),
):
    """Get daily value history for a symphony."""
    return get_symphony_performance_data(
        db=db,
        symphony_id=symphony_id,
        account_id=account_id,
        get_client_for_account_fn=_get_client_for_account,
    )


@router.get("/symphonies/{symphony_id}/summary")
def get_symphony_summary(
    symphony_id: str,
    account_id: str = Query(..., description="Sub-account ID that owns this symphony"),
    period: Optional[str] = Query(None, description="Period filter: 1D,1W,1M,3M,6M,YTD,1Y,ALL"),
    start_date: Optional[str] = Query(None, description="Custom start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Custom end date YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Period-aware summary metrics for a single symphony."""
    return get_symphony_summary_data(
        db=db,
        symphony_id=symphony_id,
        account_id=account_id,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )


# ------------------------------------------------------------------
# Live Symphony Summary (intraday overlay)
# ------------------------------------------------------------------

@router.get("/symphonies/{symphony_id}/summary/live")
def get_symphony_summary_live(
    symphony_id: str,
    live_pv: float = Query(..., description="Live symphony value"),
    live_nd: float = Query(..., description="Live symphony net deposits"),
    account_id: str = Query(..., description="Sub-account ID"),
    period: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Symphony summary with today's value replaced by live data."""
    return get_symphony_summary_live_data(
        db=db,
        symphony_id=symphony_id,
        live_pv=live_pv,
        live_nd=live_nd,
        account_id=account_id,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )


# ------------------------------------------------------------------
# Symphony backtest (cached)
# ------------------------------------------------------------------

@router.get("/symphonies/{symphony_id}/backtest")
def get_symphony_backtest(
    symphony_id: str,
    account_id: str = Query(..., description="Sub-account ID for credentials"),
    force_refresh: bool = Query(False, description="Force refresh cache"),
    db: Session = Depends(get_db),
):
    """Get backtest results for a symphony, with cache + version invalidation."""
    return get_symphony_backtest_data(
        db=db,
        symphony_id=symphony_id,
        account_id=account_id,
        force_refresh=force_refresh,
        get_client_for_account_fn=_get_client_for_account,
        test_credential=TEST_CREDENTIAL,
    )


# ------------------------------------------------------------------
# Symphony allocation history (live daily snapshots)
# ------------------------------------------------------------------

@router.get("/trade-preview")
def get_trade_preview(
    account_id: Optional[str] = Query(None, description="Sub-account ID, all:<cred>, or all"),
    db: Session = Depends(get_db),
):
    """Aggregate trade preview across all symphonies for selected accounts."""
    return get_trade_preview_data(
        db=db,
        account_id=account_id,
        get_client_for_account_fn=_get_client_for_account,
        test_credential=TEST_CREDENTIAL,
    )


@router.get("/symphonies/{symphony_id}/trade-preview")
def get_symphony_trade_preview(
    symphony_id: str,
    account_id: str = Query(..., description="Sub-account ID that owns this symphony"),
    db: Session = Depends(get_db),
):
    """Get trade preview for a single symphony."""
    return get_symphony_trade_preview_data(
        db=db,
        symphony_id=symphony_id,
        account_id=account_id,
        get_client_for_account_fn=_get_client_for_account,
        test_credential=TEST_CREDENTIAL,
    )


@router.get("/symphonies/{symphony_id}/allocations")
def get_symphony_allocations(
    symphony_id: str,
    account_id: str = Query(..., description="Sub-account ID that owns this symphony"),
    db: Session = Depends(get_db),
):
    """Return daily allocation history for a symphony (from sync snapshots)."""
    return get_symphony_allocations_data(
        db=db,
        symphony_id=symphony_id,
        account_id=account_id,
    )


# ------------------------------------------------------------------
# Symphony benchmark (backtest as benchmark overlay)
# ------------------------------------------------------------------

@router.get("/symphony-benchmark/{symphony_id}")
def get_symphony_benchmark(
    symphony_id: str,
    account_id: Optional[str] = Query(None, description="Account ID (used to find credentials)"),
    db: Session = Depends(get_db),
):
    """Fetch a symphony backtest and return benchmark-history shape."""
    return get_symphony_benchmark_data(
        db=db,
        symphony_id=symphony_id,
        account_id=account_id,
    )

