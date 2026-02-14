"""Symphony allocations read service."""

from __future__ import annotations

from typing import Dict

from sqlalchemy.orm import Session

from app.models import SymphonyAllocationHistory


def get_symphony_allocations_data(
    db: Session,
    symphony_id: str,
    account_id: str,
) -> Dict[str, Dict[str, float]]:
    """Return daily allocation history for a symphony."""
    rows = (
        db.query(SymphonyAllocationHistory)
        .filter_by(account_id=account_id, symphony_id=symphony_id)
        .order_by(SymphonyAllocationHistory.date)
        .all()
    )
    if not rows:
        return {}

    result: Dict[str, Dict[str, float]] = {}
    for row in rows:
        ds = str(row.date)
        if ds not in result:
            result[ds] = {}
        result[ds][row.ticker] = row.allocation_pct
    return result
