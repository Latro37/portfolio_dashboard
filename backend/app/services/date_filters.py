"""Shared date parsing and period-range helpers for API routers."""

from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException


def parse_iso_date(value: str, field_name: str) -> date:
    """Parse a YYYY-MM-DD date string or raise HTTP 400."""
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(400, f"Invalid {field_name}: expected YYYY-MM-DD")


def resolve_date_range(
    period: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> tuple[Optional[date], Optional[date]]:
    """Convert a period preset or custom range into (start, end) date bounds."""
    if start_date or end_date:
        start = parse_iso_date(start_date, "start_date") if start_date else None
        end = parse_iso_date(end_date, "end_date") if end_date else None
        if start and end and start > end:
            raise HTTPException(400, "start_date cannot be after end_date")
        return (start, end)

    if period and period != "ALL":
        today = date.today()
        offsets = {
            "1D": timedelta(days=1),
            "1W": timedelta(weeks=1),
            "1M": timedelta(days=30),
            "3M": timedelta(days=90),
            "1Y": timedelta(days=365),
        }
        if period == "YTD":
            return (date(today.year, 1, 1), None)
        if period in offsets:
            return (today - offsets[period], None)
    return (None, None)
