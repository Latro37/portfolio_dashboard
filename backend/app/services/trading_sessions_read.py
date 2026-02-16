"""Exchange trading-session read service."""

from functools import lru_cache
from typing import Any, Dict

import exchange_calendars as xcals
from exchange_calendars.errors import DateOutOfBounds, InvalidCalendarName
from fastapi import HTTPException

from app.services.date_filters import parse_iso_date

_CALENDAR_START = "1900-01-01"
_CALENDAR_END = "2200-12-31"


@lru_cache(maxsize=16)
def _get_calendar(exchange: str):
    try:
        return xcals.get_calendar(exchange, start=_CALENDAR_START, end=_CALENDAR_END)
    except InvalidCalendarName as exc:
        raise HTTPException(400, f"Unsupported exchange calendar '{exchange}'") from exc


def get_trading_sessions_data(exchange: str, start_date: str, end_date: str) -> Dict[str, Any]:
    """Return exchange sessions between start/end (inclusive)."""
    normalized_exchange = (exchange or "XNYS").strip().upper()
    if not normalized_exchange:
        raise HTTPException(400, "exchange is required")

    start_dt = parse_iso_date(start_date, "start_date")
    end_dt = parse_iso_date(end_date, "end_date")
    if start_dt > end_dt:
        raise HTTPException(400, "start_date cannot be after end_date")

    calendar = _get_calendar(normalized_exchange)
    try:
        sessions = calendar.sessions_in_range(start_dt, end_dt)
    except DateOutOfBounds as exc:
        raise HTTPException(400, str(exc)) from exc

    return {
        "exchange": normalized_exchange,
        "start_date": str(start_dt),
        "end_date": str(end_dt),
        "sessions": [session.strftime("%Y-%m-%d") for session in sessions],
    }
