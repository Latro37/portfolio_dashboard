from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from app.services.date_filters import parse_iso_date, resolve_date_range


def test_parse_iso_date_valid():
    assert parse_iso_date("2025-01-15", "start_date") == date(2025, 1, 15)


def test_parse_iso_date_invalid():
    with pytest.raises(HTTPException, match="Invalid start_date: expected YYYY-MM-DD"):
        parse_iso_date("01/15/2025", "start_date")


def test_resolve_date_range_custom_bounds():
    start, end = resolve_date_range(start_date="2025-02-01", end_date="2025-02-14")
    assert start == date(2025, 2, 1)
    assert end == date(2025, 2, 14)


def test_resolve_date_range_rejects_inverted_custom_range():
    with pytest.raises(HTTPException, match="start_date cannot be after end_date"):
        resolve_date_range(start_date="2025-02-14", end_date="2025-02-01")


def test_resolve_date_range_periods():
    today = date.today()

    assert resolve_date_range("ALL") == (None, None)
    assert resolve_date_range("YTD") == (date(today.year, 1, 1), None)
    assert resolve_date_range("1D") == (today - timedelta(days=1), None)
    assert resolve_date_range("1W") == (today - timedelta(weeks=1), None)
    assert resolve_date_range("1M") == (today - timedelta(days=30), None)
    assert resolve_date_range("3M") == (today - timedelta(days=90), None)
    assert resolve_date_range("1Y") == (today - timedelta(days=365), None)
