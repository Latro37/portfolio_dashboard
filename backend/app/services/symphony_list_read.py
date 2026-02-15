"""Symphony list/read service."""

from __future__ import annotations

import json
import logging
import os
from typing import Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import Account, SymphonyDailyMetrics
from app.services.account_scope import resolve_account_ids

logger = logging.getLogger(__name__)

_TEST_META_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "data", "test_symphony_meta.json"
)


def _list_symphonies_test(
    account_id: str,
    account_name: str,
    stored_twr: dict,
) -> List[Dict]:
    """Build symphony list for __TEST__ accounts from DB + JSON metadata."""
    meta_path = os.path.normpath(_TEST_META_PATH)
    if not os.path.exists(meta_path):
        logger.warning("Test symphony meta not found at %s", meta_path)
        return []
    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    result = []
    for sym_id, meta_row in meta.items():
        twr = stored_twr.get((account_id, sym_id))
        if twr is None:
            twr = meta_row.get("time_weighted_return", 0.0)
        else:
            twr = round(twr, 2)
        result.append(
            {
                "id": sym_id,
                "position_id": meta_row.get("position_id", ""),
                "account_id": account_id,
                "account_name": account_name,
                "name": meta_row.get("name", "Unknown"),
                "color": meta_row.get("color", "#888"),
                "value": meta_row.get("value", 0),
                "net_deposits": meta_row.get("net_deposits", 0),
                "cash": meta_row.get("cash", 0),
                "total_return": meta_row.get("total_return", 0),
                "cumulative_return_pct": meta_row.get("cumulative_return_pct", 0),
                "simple_return": meta_row.get("simple_return", 0),
                "time_weighted_return": twr,
                "last_dollar_change": meta_row.get("last_dollar_change", 0),
                "last_percent_change": meta_row.get("last_percent_change", 0),
                "sharpe_ratio": meta_row.get("sharpe_ratio", 0),
                "max_drawdown": meta_row.get("max_drawdown", 0),
                "annualized_return": meta_row.get("annualized_return", 0),
                "invested_since": meta_row.get("invested_since", ""),
                "last_rebalance_on": meta_row.get("last_rebalance_on"),
                "next_rebalance_on": meta_row.get("next_rebalance_on"),
                "rebalance_frequency": meta_row.get("rebalance_frequency", ""),
                "holdings": meta_row.get("holdings", []),
            }
        )
    return result


def get_symphonies_list_data(
    db: Session,
    account_id: Optional[str],
    get_client_for_account_fn: Callable[[Session, str], object],
    test_credential: str = "__TEST__",
) -> List[Dict]:
    """List active symphonies across one or more sub-accounts."""
    ids = resolve_account_ids(db, account_id)
    acct_names = {a.id: a.display_name for a in db.query(Account).filter(Account.id.in_(ids)).all()}

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

    test_ids = {
        acct.id
        for acct in db.query(Account).filter(Account.id.in_(ids)).all()
        if acct.credential_name == test_credential
    }

    result = []
    for aid in ids:
        if aid in test_ids:
            result.extend(
                _list_symphonies_test(
                    account_id=aid,
                    account_name=acct_names.get(aid, aid),
                    stored_twr=stored_twr,
                )
            )
            continue

        try:
            client = get_client_for_account_fn(db, aid)
            symphonies = client.get_symphony_stats(aid)
            for symphony in symphonies:
                sym_id = symphony.get("id", "")
                total_return = symphony.get("value", 0) - symphony.get("net_deposits", 0)
                cum_return_pct = (
                    total_return / symphony.get("net_deposits", 1) * 100
                ) if symphony.get("net_deposits", 0) else 0

                twr = stored_twr.get((aid, sym_id))
                if twr is None:
                    api_twr = symphony.get("time_weighted_return")
                    twr = round(api_twr * 100, 2) if api_twr is not None else 0.0
                else:
                    twr = round(twr, 2)

                result.append(
                    {
                        "id": sym_id,
                        "position_id": symphony.get("position_id", ""),
                        "account_id": aid,
                        "account_name": acct_names.get(aid, aid),
                        "name": symphony.get("name", "Unknown"),
                        "color": symphony.get("color", "#888"),
                        "value": round(symphony.get("value", 0), 2),
                        "net_deposits": round(symphony.get("net_deposits", 0), 2),
                        "cash": round(symphony.get("cash", 0), 2),
                        "total_return": round(total_return, 2),
                        "cumulative_return_pct": round(cum_return_pct, 2),
                        "simple_return": round(symphony.get("simple_return", 0) * 100, 2),
                        "time_weighted_return": twr,
                        "last_dollar_change": round(symphony.get("last_dollar_change", 0), 2),
                        "last_percent_change": round(
                            symphony.get("last_percent_change", 0) * 100, 2
                        ),
                        "sharpe_ratio": round(symphony.get("sharpe_ratio", 0), 2),
                        "max_drawdown": round(symphony.get("max_drawdown", 0) * 100, 2),
                        "annualized_return": round(
                            symphony.get("annualized_rate_of_return", 0) * 100, 2
                        ),
                        "invested_since": symphony.get("invested_since", ""),
                        "last_rebalance_on": symphony.get("last_rebalance_on"),
                        "next_rebalance_on": symphony.get("next_rebalance_on"),
                        "rebalance_frequency": symphony.get("rebalance_frequency", ""),
                        "holdings": [
                            {
                                "ticker": holding.get("ticker", ""),
                                "allocation": round(holding.get("allocation", 0) * 100, 2),
                                "value": round(holding.get("value", 0), 2),
                                "last_percent_change": round(
                                    holding.get("last_percent_change", 0) * 100, 2
                                ),
                            }
                            for holding in symphony.get("holdings", [])
                        ],
                    }
                )
        except Exception as exc:
            logger.warning("Failed to fetch symphonies for account %s: %s", aid, exc)

    return result
