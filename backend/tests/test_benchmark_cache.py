from __future__ import annotations

from datetime import date

from fastapi import HTTPException
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.services import benchmark_read


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def test_benchmark_cache_enforces_max_entries(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    benchmark_read._benchmark_cache.clear()
    monkeypatch.setattr(benchmark_read, "_BENCHMARK_CACHE_MAX", 2)
    monkeypatch.setattr(benchmark_read, "_BENCHMARK_TTL", 3600)

    def _stooq(_ticker: str, _start: date, _end: date):
        return [(date(2025, 1, 2), 100.0), (date(2025, 1, 3), 101.0)]

    for ticker in ("AAA", "BBB", "CCC"):
        benchmark_read.get_benchmark_history_data(
            db=db_session,
            ticker=ticker,
            start_date=None,
            end_date=None,
            account_id=None,
            get_daily_closes_stooq_fn=_stooq,
            get_daily_closes_fn=lambda *_args, **_kwargs: [],
            get_latest_price_fn=lambda _sym: None,
        )

    assert len(benchmark_read._benchmark_cache) == 2
    assert all(cache_key[0] in {"BBB", "CCC"} for cache_key in benchmark_read._benchmark_cache.keys())


def test_benchmark_history_falls_back_to_polygon_when_finnhub_access_is_denied(
    db_session: Session,
):
    benchmark_read._benchmark_cache.clear()

    result = benchmark_read.get_benchmark_history_data(
        db=db_session,
        ticker="SPY",
        start_date="2025-01-02",
        end_date="2025-01-03",
        account_id=None,
        get_daily_closes_stooq_fn=lambda *_args, **_kwargs: [],
        get_daily_closes_fn=lambda *_args, **_kwargs: (_ for _ in ()).throw(
            benchmark_read.FinnhubAccessError("no candle entitlement")
        ),
        get_daily_closes_polygon_fn=lambda *_args, **_kwargs: [
            (date(2025, 1, 2), 100.0),
            (date(2025, 1, 3), 102.0),
        ],
        get_latest_price_fn=lambda _sym: None,
    )

    assert result["ticker"] == "SPY"
    assert len(result["data"]) == 2
    assert result["data"][0]["return_pct"] == 0.0
    assert result["data"][1]["return_pct"] == 2.0


def test_benchmark_history_returns_no_data_when_polygon_is_not_configured(
    db_session: Session,
):
    benchmark_read._benchmark_cache.clear()

    with pytest.raises(HTTPException) as exc_info:
        benchmark_read.get_benchmark_history_data(
            db=db_session,
            ticker="BAD",
            start_date="2025-01-02",
            end_date="2025-01-03",
            account_id=None,
            get_daily_closes_stooq_fn=lambda *_args, **_kwargs: [],
            get_daily_closes_fn=lambda *_args, **_kwargs: [],
            get_daily_closes_polygon_fn=lambda *_args, **_kwargs: (_ for _ in ()).throw(
                benchmark_read.PolygonNotConfiguredError("Polygon API key is not configured.")
            ),
            get_latest_price_fn=lambda _sym: None,
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "No valid price data for 'BAD'"


def test_benchmark_history_preserves_finnhub_failure_when_polygon_is_not_configured(
    db_session: Session,
):
    benchmark_read._benchmark_cache.clear()

    with pytest.raises(HTTPException) as exc_info:
        benchmark_read.get_benchmark_history_data(
            db=db_session,
            ticker="SPY",
            start_date="2025-01-02",
            end_date="2025-01-03",
            account_id=None,
            get_daily_closes_stooq_fn=lambda *_args, **_kwargs: [],
            get_daily_closes_fn=lambda *_args, **_kwargs: (_ for _ in ()).throw(
                benchmark_read.FinnhubAccessError("no candle entitlement")
            ),
            get_daily_closes_polygon_fn=lambda *_args, **_kwargs: (_ for _ in ()).throw(
                benchmark_read.PolygonNotConfiguredError("Polygon API key is not configured.")
            ),
            get_latest_price_fn=lambda _sym: None,
        )

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "Finnhub benchmark data unavailable for 'SPY': no candle entitlement"
