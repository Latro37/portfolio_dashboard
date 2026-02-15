"""Symphony trade-preview orchestration service."""

from __future__ import annotations

import random
from typing import Callable, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session
import requests

from app.models import (
    Account,
    SymphonyAllocationHistory,
    SymphonyCatalogEntry,
    SymphonyDailyPortfolio,
)
from app.services.account_scope import resolve_account_ids


def _generate_test_trade_preview(db: Session, aid_list: List[str], acct_names: dict) -> List[Dict]:
    random.seed()
    results = []
    for aid in aid_list:
        alloc_rows = (
            db.query(SymphonyAllocationHistory)
            .filter_by(account_id=aid)
            .order_by(SymphonyAllocationHistory.date.desc())
            .all()
        )
        if not alloc_rows:
            continue
        alloc_date = alloc_rows[0].date

        sym_allocs: dict = {}
        for row in alloc_rows:
            if row.date != alloc_date:
                continue
            sym_allocs.setdefault(row.symphony_id, []).append(row)

        sym_ids = list(sym_allocs.keys())
        n_trade_syms = max(3, len(sym_ids) // 3)
        trade_syms = random.sample(sym_ids, min(n_trade_syms, len(sym_ids)))

        cat_entries = {
            row.symphony_id: row.name
            for row in db.query(SymphonyCatalogEntry).filter(
                SymphonyCatalogEntry.symphony_id.in_(trade_syms)
            ).all()
        }

        acct_name = acct_names.get(aid, aid)
        for sid in trade_syms:
            allocs = sym_allocs.get(sid, [])
            if len(allocs) < 2:
                continue
            n_trades = random.randint(1, min(3, len(allocs)))
            trade_allocs = random.sample(allocs, n_trades)
            for alloc in trade_allocs:
                side = random.choice(["BUY", "SELL"])
                notional = round(random.uniform(200, 5000) * (1 if side == "BUY" else -1), 2)
                prev_w = alloc.allocation_pct / 100
                shift = random.uniform(0.005, 0.03) * (1 if side == "BUY" else -1)
                next_w = max(0, prev_w + shift)
                results.append(
                    {
                        "symphony_id": sid,
                        "symphony_name": cat_entries.get(sid, sid),
                        "account_id": aid,
                        "account_name": acct_name,
                        "ticker": alloc.ticker,
                        "notional": abs(notional),
                        "quantity": round(abs(notional) / random.uniform(20, 400), 4),
                        "prev_value": round(alloc.value, 2),
                        "prev_weight": round(prev_w * 100, 2),
                        "next_weight": round(next_w * 100, 2),
                        "side": side,
                    }
                )
    return results


def _generate_test_symphony_trade_preview(db: Session, symphony_id: str, account_id: str) -> Dict:
    random.seed()
    alloc_rows = (
        db.query(SymphonyAllocationHistory)
        .filter_by(account_id=account_id, symphony_id=symphony_id)
        .order_by(SymphonyAllocationHistory.date.desc())
        .all()
    )
    cat = db.query(SymphonyCatalogEntry).filter_by(symphony_id=symphony_id).first()
    sym_name = cat.name if cat else symphony_id

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
    allocs = [row for row in alloc_rows if row.date == alloc_date and row.value > 0]
    n_trades = max(1, len(allocs) // 3)
    trade_allocs = random.sample(allocs, min(n_trades, len(allocs)))

    trades = []
    for alloc in trade_allocs:
        side = random.choice(["BUY", "SELL"])
        price = round(random.uniform(20, 400), 2)
        share_change = round(random.uniform(1, 50), 2)
        cash_change = round(share_change * price * (-1 if side == "BUY" else 1), 2)
        prev_w = alloc.allocation_pct / 100
        shift = random.uniform(0.005, 0.03) * (1 if side == "BUY" else -1)
        next_w = max(0, prev_w + shift)
        trades.append(
            {
                "ticker": alloc.ticker,
                "name": None,
                "side": side,
                "share_change": share_change if side == "BUY" else -share_change,
                "cash_change": cash_change,
                "average_price": price,
                "prev_value": round(alloc.value, 2),
                "prev_weight": round(prev_w * 100, 2),
                "next_weight": round(next_w * 100, 2),
            }
        )

    return {
        "symphony_id": symphony_id,
        "symphony_name": sym_name,
        "rebalanced": False,
        "next_rebalance_after": "",
        "symphony_value": round(sym_value, 2),
        "recommended_trades": trades,
    }


def get_trade_preview_data(
    db: Session,
    account_id: Optional[str],
    get_client_for_account_fn: Callable[[Session, str], object],
    test_credential: str = "__TEST__",
) -> List[Dict]:
    ids = resolve_account_ids(db, account_id)
    acct_names = {a.id: a.display_name for a in db.query(Account).filter(Account.id.in_(ids)).all()}

    accts = db.query(Account).filter(Account.id.in_(ids)).all()
    cred_to_ids: dict[str, list[str]] = {}
    cred_to_client: dict[str, object] = {}
    for acct in accts:
        cred_to_ids.setdefault(acct.credential_name, []).append(acct.id)
        if acct.credential_name not in cred_to_client:
            try:
                cred_to_client[acct.credential_name] = get_client_for_account_fn(db, acct.id)
            except Exception:
                pass

    results = []
    for cred_name, aid_list in cred_to_ids.items():
        if cred_name == test_credential:
            results.extend(_generate_test_trade_preview(db, aid_list, acct_names))
            continue

        client = cred_to_client.get(cred_name)
        if not client:
            continue
        try:
            dry_run_data = client.dry_run(account_uuids=aid_list)
        except requests.exceptions.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 400:
                body = exc.response.json() if exc.response.text else {}
                errors = body.get("errors", [])
                if any(err.get("code") == "dry-run-markets-closed" for err in errors):
                    continue
            continue
        except Exception:
            continue

        for acct_result in dry_run_data:
            broker_uuid = acct_result.get("broker_account_uuid", "")
            acct_name = acct_names.get(broker_uuid, acct_result.get("account_name", broker_uuid))
            dry_run_result = acct_result.get("dry_run_result", {})
            for sym_id, sym_data in dry_run_result.items():
                trades = sym_data.get("recommended_trades", [])
                if not trades:
                    continue
                for trade in trades:
                    results.append(
                        {
                            "symphony_id": sym_id,
                            "symphony_name": sym_data.get("symphony_name", "Unknown"),
                            "account_id": broker_uuid,
                            "account_name": acct_name,
                            "ticker": trade.get("ticker", ""),
                            "notional": round(trade.get("notional", 0), 2),
                            "quantity": round(trade.get("quantity", 0), 4),
                            "prev_value": round(trade.get("prev_value", 0), 2),
                            "prev_weight": round(trade.get("prev_weight", 0) * 100, 2),
                            "next_weight": round(trade.get("next_weight", 0) * 100, 2),
                            "side": "BUY" if trade.get("notional", 0) >= 0 else "SELL",
                        }
                    )
    return results


def get_symphony_trade_preview_data(
    db: Session,
    symphony_id: str,
    account_id: str,
    get_client_for_account_fn: Callable[[Session, str], object],
    test_credential: str = "__TEST__",
) -> Dict:
    acct = db.query(Account).filter_by(id=account_id).first()
    if acct and acct.credential_name == test_credential:
        return _generate_test_symphony_trade_preview(db, symphony_id, account_id)

    client = get_client_for_account_fn(db, account_id)
    try:
        data = client.get_trade_preview(symphony_id, broker_account_uuid=account_id)
    except requests.exceptions.HTTPError as exc:
        if exc.response is not None and exc.response.status_code == 400:
            body = exc.response.json() if exc.response.text else {}
            errors = body.get("errors", [])
            if any(err.get("code") == "dry-run-markets-closed" for err in errors):
                return {
                    "symphony_id": symphony_id,
                    "symphony_name": "",
                    "rebalanced": False,
                    "next_rebalance_after": "",
                    "symphony_value": 0,
                    "recommended_trades": [],
                    "markets_closed": True,
                }
        raise HTTPException(500, f"Trade preview failed: {exc}")
    except Exception as exc:
        raise HTTPException(500, f"Trade preview failed: {exc}")

    trades = []
    for trade in data.get("recommended_trades", []):
        side = trade.get("side", "BUY" if trade.get("cash_change", 0) < 0 else "SELL")
        trades.append(
            {
                "ticker": trade.get("symbol", ""),
                "name": trade.get("name"),
                "side": side,
                "share_change": round(trade.get("share_change", 0), 4),
                "cash_change": round(trade.get("cash_change", 0), 2),
                "average_price": round(trade.get("average_price", 0), 2),
                "prev_value": round(trade.get("prev_value", 0), 2),
                "prev_weight": round(trade.get("prev_weight", 0) * 100, 2),
                "next_weight": round(trade.get("next_weight", 0) * 100, 2),
            }
        )

    return {
        "symphony_id": symphony_id,
        "symphony_name": data.get("symphony_name", ""),
        "rebalanced": data.get("rebalanced", False),
        "next_rebalance_after": data.get("next_rebalance_after", ""),
        "symphony_value": round(data.get("symphony_value", 0), 2),
        "recommended_trades": trades,
    }
