from __future__ import annotations

from datetime import date

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
