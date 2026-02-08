"""Symphony API routes."""

import json
import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, SymphonyBacktestCache, SymphonyAllocationHistory
from app.composer_client import ComposerClient
from app.config import load_accounts

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["symphonies"])

CACHE_TTL_HOURS = 24


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


def _resolve_account_ids(db: Session, account_id: Optional[str]) -> List[str]:
    """Resolve account_id param to list of sub-account IDs (same logic as portfolio router)."""
    if account_id == "all":
        accts = db.query(Account).all()
        if not accts:
            raise HTTPException(404, "No accounts discovered.")
        return [a.id for a in accts]
    if account_id and account_id.startswith("all:"):
        cred_name = account_id[4:]
        accts = db.query(Account).filter_by(credential_name=cred_name).all()
        if not accts:
            raise HTTPException(404, f"No sub-accounts found for credential '{cred_name}'")
        return [a.id for a in accts]
    if account_id:
        return [account_id]
    first = db.query(Account).first()
    if not first:
        raise HTTPException(404, "No accounts discovered.")
    return [first.id]


# ------------------------------------------------------------------
# List symphonies
# ------------------------------------------------------------------

@router.get("/symphonies")
def list_symphonies(
    account_id: Optional[str] = Query(None, description="Sub-account ID, all:<cred>, or all"),
    db: Session = Depends(get_db),
):
    """List active symphonies across one or more sub-accounts."""
    ids = _resolve_account_ids(db, account_id)
    acct_names = {a.id: a.display_name for a in db.query(Account).filter(Account.id.in_(ids)).all()}

    result = []
    for aid in ids:
        try:
            client = _get_client_for_account(db, aid)
            symphonies = client.get_symphony_stats(aid)
            for s in symphonies:
                total_return = s.get("value", 0) - s.get("net_deposits", 0)
                cum_return_pct = (total_return / s.get("net_deposits", 1) * 100) if s.get("net_deposits", 0) else 0
                result.append({
                    "id": s.get("id", ""),
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
                    "time_weighted_return": round(s.get("time_weighted_return", 0) * 100, 2),
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


# ------------------------------------------------------------------
# Symphony performance (live daily values)
# ------------------------------------------------------------------

@router.get("/symphonies/{symphony_id}/performance")
def get_symphony_performance(
    symphony_id: str,
    account_id: str = Query(..., description="Sub-account ID that owns this symphony"),
    db: Session = Depends(get_db),
):
    """Get daily value history for a symphony in the same shape as /performance."""
    client = _get_client_for_account(db, account_id)
    try:
        history = client.get_symphony_history(account_id, symphony_id)
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch symphony history: {e}")

    if not history:
        return []

    initial_val = history[0]["value"]
    initial_adj = history[0]["deposit_adjusted_value"]
    twr = 1.0
    peak_adj = initial_adj

    # --- Pre-pass: infer actual cash flows using market return from adj ratio ---
    # adj only changes with market returns, so adj[i]/adj[i-1] = daily market return.
    # expected_val = prev_val * market_return.  Any difference = deposit/withdrawal.
    cash_flows: list[tuple[int, float]] = []   # (day_index, amount)
    cum_net_dep = initial_val                    # running cumulative net deposits
    net_deposits_by_day = [cum_net_dep]          # one entry per history point
    for i in range(1, len(history)):
        prev_val = history[i - 1]["value"]
        prev_adj = history[i - 1]["deposit_adjusted_value"]
        adj_i = history[i]["deposit_adjusted_value"]
        val_i = history[i]["value"]

        mkt_ret = (adj_i / prev_adj) if prev_adj > 0 else 1.0
        expected_val = prev_val * mkt_ret
        cf = val_i - expected_val
        if abs(cf) > 0.50:           # real cash flow (ignore float noise)
            cash_flows.append((i, cf))
            cum_net_dep += cf
        net_deposits_by_day.append(cum_net_dep)

    n_days = len(history)
    result = []
    for i, pt in enumerate(history):
        val = pt["value"]
        adj = pt["deposit_adjusted_value"]
        prev_adj = history[i - 1]["deposit_adjusted_value"] if i > 0 else adj

        daily_ret = (adj - prev_adj) / prev_adj if prev_adj > 0 and i > 0 else 0.0
        if i > 0:
            twr *= (1 + daily_ret)
        twr_pct = (twr - 1) * 100

        cum_ret = ((adj / initial_adj) - 1) * 100 if initial_adj > 0 else 0.0

        peak_adj = max(peak_adj, adj)
        drawdown = ((adj - peak_adj) / peak_adj) * 100 if peak_adj > 0 else 0.0

        net_dep = net_deposits_by_day[i]

        # Modified Dietz MWR from inception to current day
        mwr_pct = 0.0
        if i > 0:
            period_len = i  # days from start
            total_cf = 0.0
            weighted_cf = 0.0
            for cf_day, cf_amt in cash_flows:
                if cf_day <= i:
                    total_cf += cf_amt
                    weight = (i - cf_day) / period_len
                    weighted_cf += cf_amt * weight
            denom = initial_val + weighted_cf
            if denom > 0:
                mwr_pct = ((val - initial_val - total_cf) / denom) * 100

        result.append({
            "date": pt["date"],
            "portfolio_value": round(val, 2),
            "net_deposits": round(net_dep, 2),
            "cumulative_return_pct": round(cum_ret, 4),
            "daily_return_pct": round(daily_ret * 100, 4),
            "time_weighted_return": round(twr_pct, 4),
            "money_weighted_return": round(mwr_pct, 4),
            "current_drawdown": round(drawdown, 4),
        })
    return result


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
    """Get backtest results for a symphony, using cache when available."""
    # Check cache
    if not force_refresh:
        cached = db.query(SymphonyBacktestCache).filter_by(symphony_id=symphony_id).first()
        if cached and cached.cached_at > datetime.utcnow() - timedelta(hours=CACHE_TTL_HOURS):
            return {
                "stats": json.loads(cached.stats_json),
                "dvm_capital": json.loads(cached.dvm_capital_json),
                "tdvm_weights": json.loads(cached.tdvm_weights_json),
                "benchmarks": json.loads(cached.benchmarks_json),
                "first_day": cached.first_day,
                "last_market_day": cached.last_market_day,
                "cached_at": cached.cached_at.isoformat(),
            }

    # Fetch fresh backtest
    client = _get_client_for_account(db, account_id)
    try:
        data = client.get_symphony_backtest(symphony_id)
    except Exception as e:
        raise HTTPException(500, f"Backtest failed: {e}")

    stats = data.get("stats", {})
    dvm_capital = data.get("dvm_capital", {})
    tdvm_weights = data.get("tdvm_weights", {})
    benchmarks = stats.get("benchmarks", {})
    first_day = data.get("first_day", 0)
    last_market_day = data.get("last_market_day", 0)

    # Upsert cache
    existing = db.query(SymphonyBacktestCache).filter_by(symphony_id=symphony_id).first()
    now = datetime.utcnow()
    if existing:
        existing.account_id = account_id
        existing.cached_at = now
        existing.stats_json = json.dumps(stats)
        existing.dvm_capital_json = json.dumps(dvm_capital)
        existing.tdvm_weights_json = json.dumps(tdvm_weights)
        existing.benchmarks_json = json.dumps(benchmarks)
        existing.first_day = first_day
        existing.last_market_day = last_market_day
    else:
        db.add(SymphonyBacktestCache(
            symphony_id=symphony_id,
            account_id=account_id,
            cached_at=now,
            stats_json=json.dumps(stats),
            dvm_capital_json=json.dumps(dvm_capital),
            tdvm_weights_json=json.dumps(tdvm_weights),
            benchmarks_json=json.dumps(benchmarks),
            first_day=first_day,
            last_market_day=last_market_day,
        ))
    db.commit()

    return {
        "stats": stats,
        "dvm_capital": dvm_capital,
        "tdvm_weights": tdvm_weights,
        "benchmarks": benchmarks,
        "first_day": first_day,
        "last_market_day": last_market_day,
        "cached_at": now.isoformat(),
    }


# ------------------------------------------------------------------
# Symphony allocation history (live daily snapshots)
# ------------------------------------------------------------------

@router.get("/trade-preview")
def get_trade_preview(
    account_id: Optional[str] = Query(None, description="Sub-account ID, all:<cred>, or all"),
    db: Session = Depends(get_db),
):
    """Aggregate trade preview across all symphonies for selected accounts."""
    ids = _resolve_account_ids(db, account_id)
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
        client = cred_to_client.get(cred_name)
        if not client:
            continue
        try:
            dry_run_data = client.dry_run(account_uuids=aid_list)
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
    client = _get_client_for_account(db, account_id)
    try:
        data = client.get_trade_preview(symphony_id, broker_account_uuid=account_id)
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
