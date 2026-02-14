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
    SymphonyDailyPortfolio, SymphonyDailyMetrics, SymphonyCatalogEntry,
)
import requests

from app.composer_client import ComposerClient
from app.config import load_accounts
from app.services.backtest_cache import get_symphony_backtest_data
from app.services.account_scope import resolve_account_ids
from app.services.symphony_read import (
    get_symphony_performance_data,
    get_symphony_summary_data,
    get_symphony_summary_live_data,
)
from app.market_hours import is_within_trading_session
import time

import math

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


def _generate_test_trade_preview(db: Session, aid_list: List[str], acct_names: dict) -> List[Dict]:
    """Generate synthetic aggregate trade preview for __TEST__ accounts."""
    import random as _rnd
    _rnd.seed()  # don't use fixed seed â€” vary each call
    results = []
    for aid in aid_list:
        # Get symphonies with their allocations
        alloc_rows = (
            db.query(SymphonyAllocationHistory)
            .filter_by(account_id=aid)
            .order_by(SymphonyAllocationHistory.date.desc())
            .all()
        )
        if not alloc_rows:
            continue
        alloc_date = alloc_rows[0].date
        # Group by symphony
        sym_allocs: dict = {}
        for r in alloc_rows:
            if r.date != alloc_date:
                continue
            sym_allocs.setdefault(r.symphony_id, []).append(r)

        # Pick ~30% of symphonies to have trades
        sym_ids = list(sym_allocs.keys())
        n_trade_syms = max(3, len(sym_ids) // 3)
        trade_syms = _rnd.sample(sym_ids, min(n_trade_syms, len(sym_ids)))

        # Get symphony names from catalog
        cat_entries = {c.symphony_id: c.name for c in db.query(SymphonyCatalogEntry).filter(
            SymphonyCatalogEntry.symphony_id.in_(trade_syms)
        ).all()}

        acct_name = acct_names.get(aid, aid)
        for sid in trade_syms:
            allocs = sym_allocs.get(sid, [])
            if len(allocs) < 2:
                continue
            # Pick 1-3 tickers to trade per symphony
            n_trades = _rnd.randint(1, min(3, len(allocs)))
            trade_allocs = _rnd.sample(allocs, n_trades)
            for a in trade_allocs:
                side = _rnd.choice(["BUY", "SELL"])
                notional = round(_rnd.uniform(200, 5000) * (1 if side == "BUY" else -1), 2)
                prev_w = a.allocation_pct / 100
                shift = _rnd.uniform(0.005, 0.03) * (1 if side == "BUY" else -1)
                next_w = max(0, prev_w + shift)
                results.append({
                    "symphony_id": sid,
                    "symphony_name": cat_entries.get(sid, sid),
                    "account_id": aid,
                    "account_name": acct_name,
                    "ticker": a.ticker,
                    "notional": abs(notional),
                    "quantity": round(abs(notional) / _rnd.uniform(20, 400), 4),
                    "prev_value": round(a.value, 2),
                    "prev_weight": round(prev_w * 100, 2),
                    "next_weight": round(next_w * 100, 2),
                    "side": side,
                })
    return results


def _generate_test_symphony_trade_preview(db: Session, symphony_id: str, account_id: str) -> Dict:
    """Generate synthetic per-symphony trade preview for __TEST__ accounts."""
    import random as _rnd
    _rnd.seed()

    # Get allocations for this symphony
    alloc_rows = (
        db.query(SymphonyAllocationHistory)
        .filter_by(account_id=account_id, symphony_id=symphony_id)
        .order_by(SymphonyAllocationHistory.date.desc())
        .all()
    )

    cat = db.query(SymphonyCatalogEntry).filter_by(symphony_id=symphony_id).first()
    sym_name = cat.name if cat else symphony_id

    # Get symphony value
    latest = (
        db.query(SymphonyDailyPortfolio)
        .filter_by(account_id=account_id, symphony_id=symphony_id)
        .order_by(SymphonyDailyPortfolio.date.desc())
        .first()
    )
    sym_value = latest.portfolio_value if latest else 0

    if not alloc_rows:
        return {
            "symphony_id": symphony_id,
            "symphony_name": sym_name,
            "rebalanced": False,
            "next_rebalance_after": "",
            "symphony_value": round(sym_value, 2),
            "recommended_trades": [],
        }

    alloc_date = alloc_rows[0].date
    allocs = [r for r in alloc_rows if r.date == alloc_date and r.value > 0]

    # Generate trades for ~30% of holdings
    n_trades = max(1, len(allocs) // 3)
    trade_allocs = _rnd.sample(allocs, min(n_trades, len(allocs)))

    trades = []
    for a in trade_allocs:
        side = _rnd.choice(["BUY", "SELL"])
        price = round(_rnd.uniform(20, 400), 2)
        share_change = round(_rnd.uniform(1, 50), 2)
        cash_change = round(share_change * price * (-1 if side == "BUY" else 1), 2)
        prev_w = a.allocation_pct / 100
        shift = _rnd.uniform(0.005, 0.03) * (1 if side == "BUY" else -1)
        next_w = max(0, prev_w + shift)
        trades.append({
            "ticker": a.ticker,
            "name": None,
            "side": side,
            "share_change": share_change if side == "BUY" else -share_change,
            "cash_change": cash_change,
            "average_price": price,
            "prev_value": round(a.value, 2),
            "prev_weight": round(prev_w * 100, 2),
            "next_weight": round(next_w * 100, 2),
        })

    return {
        "symphony_id": symphony_id,
        "symphony_name": sym_name,
        "rebalanced": False,
        "next_rebalance_after": "",
        "symphony_value": round(sym_value, 2),
        "recommended_trades": trades,
    }


# ------------------------------------------------------------------
# Symphony catalog (name search for benchmarks)
# ------------------------------------------------------------------

_CATALOG_TTL_SECONDS = 3600  # auto-refresh if older than 1 hour


def _refresh_symphony_catalog(db: Session):
    """Fetch invested, watchlist, and draft symphonies across all credentials and upsert into catalog."""
    accounts_creds = load_accounts()
    now = datetime.utcnow()

    # Collect all entries: (symphony_id, name, source, credential_name)
    entries: Dict[str, tuple] = {}  # keyed by symphony_id to deduplicate

    for creds in accounts_creds:
        client = ComposerClient.from_credentials(creds)

        # --- Invested symphonies (from all sub-accounts for this credential) ---
        db_accounts = db.query(Account).filter_by(credential_name=creds.name).all()
        for acct in db_accounts:
            try:
                symphonies = client.get_symphony_stats(acct.id)
                for s in symphonies:
                    sid = s.get("id", "")
                    name = s.get("name", "")
                    if sid and name:
                        entries[sid] = (sid, name, "invested", creds.name)
            except Exception as e:
                logger.warning("Catalog: failed invested fetch for %s/%s: %s", creds.name, acct.id, e)

        # --- Watchlist ---
        try:
            watchlist = client.get_watchlist()
            for s in watchlist:
                sid = s.get("symphony_id", s.get("id", s.get("symphony_sid", "")))
                name = s.get("name", "")
                if sid and name and sid not in entries:
                    entries[sid] = (sid, name, "watchlist", creds.name)
        except Exception as e:
            logger.warning("Catalog: failed watchlist fetch for %s: %s", creds.name, e)

        # --- Drafts ---
        try:
            drafts = client.get_drafts()
            for s in drafts:
                sid = s.get("symphony_id", s.get("id", s.get("symphony_sid", "")))
                name = s.get("name", "")
                if sid and name and sid not in entries:
                    entries[sid] = (sid, name, "draft", creds.name)
        except Exception as e:
            logger.warning("Catalog: failed drafts fetch for %s: %s", creds.name, e)

    # Upsert into DB
    for sid, name, source, cred_name in entries.values():
        existing = db.query(SymphonyCatalogEntry).filter_by(symphony_id=sid).first()
        if existing:
            existing.name = name
            existing.source = source
            existing.credential_name = cred_name
            existing.updated_at = now
        else:
            db.add(SymphonyCatalogEntry(
                symphony_id=sid, name=name, source=source,
                credential_name=cred_name, updated_at=now,
            ))

    db.commit()
    logger.info("Symphony catalog refreshed: %d entries", len(entries))


@router.get("/symphony-catalog")
def get_symphony_catalog(
    refresh: bool = Query(False, description="Force refresh from Composer API"),
    db: Session = Depends(get_db),
):
    """Return cached symphony catalog for name search. Auto-refreshes if stale."""
    # Check staleness
    from sqlalchemy import func
    latest = db.query(func.max(SymphonyCatalogEntry.updated_at)).scalar()
    is_stale = latest is None or (datetime.utcnow() - latest).total_seconds() > _CATALOG_TTL_SECONDS

    if refresh or is_stale:
        try:
            _refresh_symphony_catalog(db)
        except Exception as e:
            logger.warning("Catalog refresh failed: %s", e)
            if latest is None:
                return []

    rows = db.query(SymphonyCatalogEntry).order_by(SymphonyCatalogEntry.name).all()
    return [
        {"symphony_id": r.symphony_id, "name": r.name, "source": r.source}
        for r in rows
    ]


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
    ids = resolve_account_ids(db, account_id)
    acct_names = {a.id: a.display_name for a in db.query(Account).filter(Account.id.in_(ids)).all()}

    # Group account IDs by credential so we make one dry-run call per credential
    accts = db.query(Account).filter(Account.id.in_(ids)).all()
    cred_to_ids: dict[str, list[str]] = {}
    cred_to_client: dict[str, ComposerClient] = {}
    for a in accts:
        cred_to_ids.setdefault(a.credential_name, []).append(a.id)
        if a.credential_name not in cred_to_client:
            try:
                cred_to_client[a.credential_name] = _get_client_for_account(db, a.id)
            except Exception:
                pass

    results = []
    for cred_name, aid_list in cred_to_ids.items():
        # __TEST__ accounts: generate synthetic trade preview from DB
        if cred_name == TEST_CREDENTIAL:
            results.extend(_generate_test_trade_preview(db, aid_list, acct_names))
            continue
        client = cred_to_client.get(cred_name)
        if not client:
            continue
        try:
            dry_run_data = client.dry_run(account_uuids=aid_list)
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 400:
                body = e.response.json() if e.response.text else {}
                errors = body.get("errors", [])
                if any(err.get("code") == "dry-run-markets-closed" for err in errors):
                    logger.info("Markets closed â€” skipping dry-run for credential %s", cred_name)
                    continue
            logger.warning("Dry-run failed for credential %s: %s", cred_name, e)
            continue
        except Exception as e:
            logger.warning("Dry-run failed for credential %s: %s", cred_name, e)
            continue

        for acct_result in dry_run_data:
            broker_uuid = acct_result.get("broker_account_uuid", "")
            acct_name = acct_names.get(broker_uuid, acct_result.get("account_name", broker_uuid))
            dry_run_result = acct_result.get("dry_run_result", {})

            for sym_id, sym_data in dry_run_result.items():
                trades = sym_data.get("recommended_trades", [])
                if not trades:
                    continue
                for t in trades:
                    results.append({
                        "symphony_id": sym_id,
                        "symphony_name": sym_data.get("symphony_name", "Unknown"),
                        "account_id": broker_uuid,
                        "account_name": acct_name,
                        "ticker": t.get("ticker", ""),
                        "notional": round(t.get("notional", 0), 2),
                        "quantity": round(t.get("quantity", 0), 4),
                        "prev_value": round(t.get("prev_value", 0), 2),
                        "prev_weight": round(t.get("prev_weight", 0) * 100, 2),
                        "next_weight": round(t.get("next_weight", 0) * 100, 2),
                        "side": "BUY" if t.get("notional", 0) >= 0 else "SELL",
                    })

    return results


@router.get("/symphonies/{symphony_id}/trade-preview")
def get_symphony_trade_preview(
    symphony_id: str,
    account_id: str = Query(..., description="Sub-account ID that owns this symphony"),
    db: Session = Depends(get_db),
):
    """Get trade preview for a single symphony."""
    # __TEST__ bypass
    acct = db.query(Account).filter_by(id=account_id).first()
    if acct and acct.credential_name == TEST_CREDENTIAL:
        return _generate_test_symphony_trade_preview(db, symphony_id, account_id)

    client = _get_client_for_account(db, account_id)
    try:
        data = client.get_trade_preview(symphony_id, broker_account_uuid=account_id)
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 400:
            body = e.response.json() if e.response.text else {}
            errors = body.get("errors", [])
            if any(err.get("code") == "dry-run-markets-closed" for err in errors):
                logger.info("Markets closed â€” returning empty trade preview for %s", symphony_id)
                return {
                    "symphony_id": symphony_id,
                    "symphony_name": "",
                    "rebalanced": False,
                    "next_rebalance_after": "",
                    "symphony_value": 0,
                    "recommended_trades": [],
                    "markets_closed": True,
                }
        raise HTTPException(500, f"Trade preview failed: {e}")
    except Exception as e:
        raise HTTPException(500, f"Trade preview failed: {e}")

    trades = []
    for t in data.get("recommended_trades", []):
        side = t.get("side", "BUY" if t.get("cash_change", 0) < 0 else "SELL")
        trades.append({
            "ticker": t.get("symbol", ""),
            "name": t.get("name"),
            "side": side,
            "share_change": round(t.get("share_change", 0), 4),
            "cash_change": round(t.get("cash_change", 0), 2),
            "average_price": round(t.get("average_price", 0), 2),
            "prev_value": round(t.get("prev_value", 0), 2),
            "prev_weight": round(t.get("prev_weight", 0) * 100, 2),
            "next_weight": round(t.get("next_weight", 0) * 100, 2),
        })

    return {
        "symphony_id": symphony_id,
        "symphony_name": data.get("symphony_name", ""),
        "rebalanced": data.get("rebalanced", False),
        "next_rebalance_after": data.get("next_rebalance_after", ""),
        "symphony_value": round(data.get("symphony_value", 0), 2),
        "recommended_trades": trades,
    }


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

_symphony_bench_cache: Dict[str, tuple] = {}  # symphony_id -> (timestamp, response_dict)
_SYMPHONY_BENCH_TTL = 3600  # 1 hour


def _epoch_day_to_date(day_num: int) -> date:
    """Convert epoch day number to a date object."""
    return date.fromordinal(date(1970, 1, 1).toordinal() + day_num)


@router.get("/symphony-benchmark/{symphony_id}")
def get_symphony_benchmark(
    symphony_id: str,
    account_id: Optional[str] = Query(None, description="Account ID (used to find credentials)"),
    db: Session = Depends(get_db),
):
    """Fetch a symphony backtest and return it in BenchmarkPoint format.

    Tries each set of credentials until the backtest succeeds (handles private symphonies).
    """
    symphony_id = symphony_id.strip()
    if not symphony_id:
        raise HTTPException(400, "Symphony ID is required")

    # Check cache
    if symphony_id in _symphony_bench_cache:
        ts, cached = _symphony_bench_cache[symphony_id]
        if time.time() - ts < _SYMPHONY_BENCH_TTL:
            return cached

    # Gather unique clients to try (deduplicated by credential name)
    all_accounts = db.query(Account).all()
    if not all_accounts:
        raise HTTPException(404, "No accounts discovered")

    accounts_creds = load_accounts()
    cred_map: Dict[str, ComposerClient] = {}
    for acct in all_accounts:
        if acct.credential_name not in cred_map:
            for creds in accounts_creds:
                if creds.name == acct.credential_name:
                    cred_map[acct.credential_name] = ComposerClient.from_credentials(creds)
                    break

    # Try each credential set
    backtest_data = None
    last_error = ""
    for cred_name, client in cred_map.items():
        try:
            backtest_data = client.get_symphony_backtest(symphony_id)
            break
        except Exception as e:
            last_error = str(e)
            logger.debug("Backtest for %s failed with credentials '%s': %s", symphony_id, cred_name, e)
            continue

    if backtest_data is None:
        raise HTTPException(404, f"Symphony '{symphony_id}' not found or backtest failed: {last_error}")

    # Extract symphony name â€” try stats, then top-level, then score endpoint
    stats = backtest_data.get("stats", {})
    symphony_name = stats.get("name", "") or backtest_data.get("name", "")
    if not symphony_name:
        try:
            score = client.get_symphony_score(symphony_id)
            symphony_name = score.get("name", "") or symphony_id
        except Exception:
            symphony_name = symphony_id

    # Extract dvm_capital series
    dvm_capital = backtest_data.get("dvm_capital", {})
    if not dvm_capital:
        raise HTTPException(400, "No backtest data available for this symphony")

    # dvm_capital is {symphony_id: {day_offset: value}} â€” extract inner series
    first_key = next(iter(dvm_capital))
    series = dvm_capital[first_key] if isinstance(dvm_capital[first_key], dict) else dvm_capital

    sorted_keys = sorted(series.keys(), key=lambda k: int(k))
    if len(sorted_keys) < 2:
        raise HTTPException(400, "Insufficient backtest data")

    # Build closes list (date, value)
    closes = []
    for k in sorted_keys:
        day_num = int(k)
        d = _epoch_day_to_date(day_num)
        val = float(series[k])
        if not math.isnan(val) and val > 0:
            closes.append((d, val))

    if not closes:
        raise HTTPException(400, "No valid backtest data")

    # Compute TWR (cumulative return from first date)
    first_val = closes[0][1]
    result_data = []
    peak = first_val
    for d, val in closes:
        return_pct = round(((val / first_val) - 1) * 100, 4)
        if val > peak:
            peak = val
        drawdown_pct = round(((val / peak) - 1) * 100, 4) if peak > 0 else 0.0
        result_data.append({
            "date": str(d),
            "close": round(val, 2),
            "return_pct": return_pct,
            "drawdown_pct": drawdown_pct,
            "mwr_pct": 0.0,
        })

    response = {"name": symphony_name, "ticker": symphony_name, "data": result_data}
    _symphony_bench_cache[symphony_id] = (time.time(), response)
    return response

