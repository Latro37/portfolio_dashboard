"""Portfolio transactions/cash-flow read services."""

from __future__ import annotations

from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import Account, CashFlow, Transaction


def get_portfolio_transactions_data(
    db: Session,
    account_ids: List[str],
    symbol: Optional[str],
    limit: int,
    offset: int,
) -> Dict:
    """Transaction history with optional symbol filter."""
    query = db.query(Transaction).filter(
        Transaction.account_id.in_(account_ids)
    ).order_by(Transaction.date.desc())
    if symbol:
        query = query.filter(Transaction.symbol == symbol.upper())
    total = query.count()
    rows = query.offset(offset).limit(limit).all()

    acct_names = {
        acct.id: acct.display_name
        for acct in db.query(Account).filter(Account.id.in_(account_ids)).all()
    }
    return {
        "total": total,
        "transactions": [
            {
                "date": str(row.date),
                "symbol": row.symbol,
                "action": row.action,
                "quantity": row.quantity,
                "price": row.price,
                "total_amount": row.total_amount,
                "account_id": row.account_id,
                "account_name": acct_names.get(row.account_id, row.account_id),
            }
            for row in rows
        ],
    }


def get_portfolio_cash_flows_data(
    db: Session,
    account_ids: List[str],
) -> List[Dict]:
    """All deposits, fees, and dividends."""
    rows = db.query(CashFlow).filter(
        CashFlow.account_id.in_(account_ids)
    ).order_by(CashFlow.date).all()
    acct_names = {
        acct.id: acct.display_name
        for acct in db.query(Account).filter(Account.id.in_(account_ids)).all()
    }
    return [
        {
            "date": str(row.date),
            "type": row.type,
            "amount": row.amount,
            "description": row.description,
            "account_id": row.account_id,
            "account_name": acct_names.get(row.account_id, row.account_id),
        }
        for row in rows
    ]
