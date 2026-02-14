"""Symphony API routes."""

import json
import logging
import os
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Account, SymphonyAllocationHistory,
    SymphonyDailyMetrics,
)

from app.composer_client import ComposerClient
from app.config import load_accounts
from app.services.backtest_cache import get_symphony_backtest_data
from app.services.account_scope import resolve_account_ids
from app.services.symphony_benchmark_read import get_symphony_benchmark_data
from app.services.symphony_catalog import get_symphony_catalog_data
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
_TEST_META_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "test_symphony_meta.json")


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
    ids = resolve_account_ids(db, account_id)
    acct_names = {a.id: a.display_name for a in db.query(Account).filter(Account.id.in_(ids)).all()}

    # Pre-load stored TWR from our own metrics (authoritative, not Composer API)
    stored_twr: dict = {}
    for aid in ids:
        rows = (
            db.query(SymphonyDailyMetrics.symphony_id, SymphonyDailyMetrics.time_weighted_return)
            .filter_by(account_id=aid)
            .order_by(SymphonyDailyMetrics.date.desc())
            .all()
        )
        seen = set()
        for sym_id, twr in rows:
            if sym_id not in seen:
                stored_twr[(aid, sym_id)] = twr
                seen.add(sym_id)

    # Identify which accounts are __TEST__ vs real
    test_ids = set()
    acct_objs = db.query(Account).filter(Account.id.in_(ids)).all()
    for a in acct_objs:
        if a.credential_name == TEST_CREDENTIAL:
            test_ids.add(a.id)

    result = []
    for aid in ids:
        if aid in test_ids:
            # Serve test symphonies from DB + JSON metadata
            result.extend(_list_symphonies_test(db, aid, acct_names.get(aid, aid), stored_twr))
            continue
        try:
            client = _get_client_for_account(db, aid)
            symphonies = client.get_symphony_stats(aid)
            for s in symphonies:
                sym_id = s.get("id", "")
                total_return = s.get("value", 0) - s.get("net_deposits", 0)
                cum_return_pct = (total_return / s.get("net_deposits", 1) * 100) if s.get("net_deposits", 0) else 0
                # Use stored TWR (already in %) if available; fall back to API value (* 100)
                twr = stored_twr.get((aid, sym_id))
                if twr is None:
                    api_twr = s.get("time_weighted_return")
                    twr = round(api_twr * 100, 2) if api_twr is not None else 0.0
                else:
                    twr = round(twr, 2)
                result.append({
                    "id": sym_id,
                    "position_id": s.get("position_id", ""),
                    "account_id": aid,
                    "account_name": acct_names.get(aid, aid),
                    "name": s.get("name", "Unknown"),
                    "color": s.get("color", "#888"),
                    "value": round(s.get("value", 0), 2),
                    "net_deposits": round(s.get("net_deposits", 0), 2),
                    "cash": round(s.get("cash", 0), 2),
                    "total_return": round(total_return, 2),
                    "cumulative_return_pct": round(cum_return_pct, 2),
                    "simple_return": round(s.get("simple_return", 0) * 100, 2),
                    "time_weighted_return": twr,
                    "last_dollar_change": round(s.get("last_dollar_change", 0), 2),
                    "last_percent_change": round(s.get("last_percent_change", 0) * 100, 2),
                    "sharpe_ratio": round(s.get("sharpe_ratio", 0), 2),
                    "max_drawdown": round(s.get("max_drawdown", 0) * 100, 2),
                    "annualized_return": round(s.get("annualized_rate_of_return", 0) * 100, 2),
                    "invested_since": s.get("invested_since", ""),
                    "last_rebalance_on": s.get("last_rebalance_on"),
                    "next_rebalance_on": s.get("next_rebalance_on"),
                    "rebalance_frequency": s.get("rebalance_frequency", ""),
                    "holdings": [
                        {
                            "ticker": h.get("ticker", ""),
                            "allocation": round(h.get("allocation", 0) * 100, 2),
                            "value": round(h.get("value", 0), 2),
                            "last_percent_change": round(h.get("last_percent_change", 0) * 100, 2),
                        }
                        for h in s.get("holdings", [])
                    ],
                })
        except Exception as e:
            logger.warning("Failed to fetch symphonies for account %s: %s", aid, e)

    return result


def _list_symphonies_test(db: Session, account_id: str, account_name: str, stored_twr: dict) -> List[Dict]:
    """Build symphony list for __TEST__ accounts from DB + JSON metadata."""
    # Load static metadata generated by the seed script
    meta_path = os.path.normpath(_TEST_META_PATH)
    if not os.path.exists(meta_path):
        logger.warning("Test symphony meta not found at %s", meta_path)
        return []
    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    result = []
    for sym_id, m in meta.items():
        twr = stored_twr.get((account_id, sym_id))
        if twr is None:
            twr = m.get("time_weighted_return", 0.0)
        else:
            twr = round(twr, 2)
        result.append({
            "id": sym_id,
            "position_id": m.get("position_id", ""),
            "account_id": account_id,
            "account_name": account_name,
            "name": m.get("name", "Unknown"),
            "color": m.get("color", "#888"),
            "value": m.get("value", 0),
            "net_deposits": m.get("net_deposits", 0),
            "cash": m.get("cash", 0),
            "total_return": m.get("total_return", 0),
            "cumulative_return_pct": m.get("cumulative_return_pct", 0),
            "simple_return": m.get("simple_return", 0),
            "time_weighted_return": twr,
            "last_dollar_change": m.get("last_dollar_change", 0),
            "last_percent_change": m.get("last_percent_change", 0),
            "sharpe_ratio": m.get("sharpe_ratio", 0),
            "max_drawdown": m.get("max_drawdown", 0),
            "annualized_return": m.get("annualized_return", 0),
            "invested_since": m.get("invested_since", ""),
            "last_rebalance_on": m.get("last_rebalance_on"),
            "next_rebalance_on": m.get("next_rebalance_on"),
            "rebalance_frequency": m.get("rebalance_frequency", ""),
            "holdings": m.get("holdings", []),
        })
    return result


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
    rows = (
        db.query(SymphonyAllocationHistory)
        .filter_by(account_id=account_id, symphony_id=symphony_id)
        .order_by(SymphonyAllocationHistory.date)
        .all()
    )
    if not rows:
        return {}

    # Build {date_str: {ticker: allocation_pct}}
    result: dict[str, dict[str, float]] = {}
    for r in rows:
        ds = str(r.date)
        if ds not in result:
            result[ds] = {}
        result[ds][r.ticker] = r.allocation_pct

    return result


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

