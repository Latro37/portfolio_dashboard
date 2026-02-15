"""Portfolio holdings read services."""

from __future__ import annotations

from datetime import date
from typing import Callable, Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Account, HoldingsHistory, SymphonyAllocationHistory
from app.services.date_filters import parse_iso_date


def get_portfolio_holdings_data(
    db: Session,
    account_ids: List[str],
    target_date: Optional[str],
    get_client_for_account_fn: Callable[[Session, str], object],
) -> Dict:
    """Holdings for a specific date (defaults to latest)."""
    base_query = db.query(HoldingsHistory).filter(HoldingsHistory.account_id.in_(account_ids))

    rows = []
    latest_date = None
    if target_date:
        resolved_date = parse_iso_date(target_date, "date")
        rows = base_query.filter(
            HoldingsHistory.date <= resolved_date
        ).order_by(HoldingsHistory.date.desc()).all()
        if rows:
            latest_date = rows[0].date
            rows = [row for row in rows if row.date == latest_date]
        else:
            latest_date = resolved_date
    else:
        latest_date_row = base_query.with_entities(HoldingsHistory.date).order_by(
            HoldingsHistory.date.desc()
        ).first()
        if latest_date_row:
            latest_date = latest_date_row[0]
            rows = base_query.filter_by(date=latest_date).all()

    notional_map: Dict[str, float] = {}
    test_ids = {
        acct.id
        for acct in db.query(Account).filter_by(credential_name="__TEST__").all()
    }

    for aid in account_ids:
        if aid in test_ids:
            alloc_rows = (
                db.query(SymphonyAllocationHistory)
                .filter_by(account_id=aid)
                .order_by(SymphonyAllocationHistory.date.desc())
                .all()
            )
            if alloc_rows:
                alloc_date = alloc_rows[0].date
                for row in alloc_rows:
                    if row.date == alloc_date and row.value > 0:
                        notional_map[row.ticker] = notional_map.get(row.ticker, 0) + row.value
            continue

        try:
            client = get_client_for_account_fn(db, aid)
            stats = client.get_holding_stats(aid)
            for holding in stats.get("holdings", []):
                symbol = holding.get("symbol", "")
                if symbol and symbol != "$USD":
                    notional_map[symbol] = notional_map.get(symbol, 0) + float(
                        holding.get("notional_value", 0)
                    )
        except Exception:
            pass

    holdings_by_symbol: Dict[str, Dict] = {}
    for row in rows:
        if row.symbol in holdings_by_symbol:
            holdings_by_symbol[row.symbol]["quantity"] += row.quantity
        else:
            holdings_by_symbol[row.symbol] = {"symbol": row.symbol, "quantity": row.quantity}

    if holdings_by_symbol:
        holdings = []
        for symbol, holding in holdings_by_symbol.items():
            market_value = notional_map.get(symbol, 0.0)
            holdings.append(
                {
                    "symbol": symbol,
                    "quantity": holding["quantity"],
                    "market_value": round(market_value, 2),
                }
            )
    elif notional_map:
        holdings = [
            {"symbol": symbol, "quantity": 0, "market_value": round(value, 2)}
            for symbol, value in notional_map.items()
        ]
        latest_date = date.today()
    else:
        return {"date": str(latest_date) if latest_date else None, "holdings": []}

    total_value = sum(holding["market_value"] for holding in holdings)
    for holding in holdings:
        holding["allocation_pct"] = round(
            holding["market_value"] / total_value * 100, 2
        ) if total_value > 0 else 0

    return {"date": str(latest_date), "holdings": holdings}


def get_portfolio_holdings_history_data(
    db: Session,
    account_ids: List[str],
) -> List[Dict]:
    """All holdings history dates with position counts."""
    rows = db.query(
        HoldingsHistory.date,
        func.count(HoldingsHistory.symbol).label("num_positions"),
    ).filter(
        HoldingsHistory.account_id.in_(account_ids)
    ).group_by(HoldingsHistory.date).order_by(HoldingsHistory.date).all()
    return [{"date": str(row.date), "num_positions": row.num_positions} for row in rows]
