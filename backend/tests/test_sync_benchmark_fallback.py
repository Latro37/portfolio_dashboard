from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import BenchmarkData, DailyPortfolio
from app.services import sync


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


def test_sync_benchmark_falls_back_to_polygon_when_finnhub_access_is_denied(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    account_id = "acct-1"
    db_session.add(
        DailyPortfolio(
            account_id=account_id,
            date=date(2025, 1, 2),
            portfolio_value=100000.0,
            cash_balance=0.0,
            net_deposits=100000.0,
            total_fees=0.0,
            total_dividends=0.0,
        )
    )
    db_session.commit()

    monkeypatch.setattr(
        sync,
        "get_settings",
        lambda: SimpleNamespace(benchmark_ticker="SPY"),
    )
    monkeypatch.setattr(sync, "get_daily_closes_stooq", lambda *_args, **_kwargs: [])

    def _raise_finnhub_access(*_args, **_kwargs):
        raise sync.FinnhubAccessError("no candle entitlement")

    monkeypatch.setattr(sync, "get_daily_closes", _raise_finnhub_access)
    monkeypatch.setattr(
        sync,
        "get_daily_closes_polygon",
        lambda *_args, **_kwargs: [
            (date(2025, 1, 2), 500.0),
            (date(2025, 1, 3), 505.0),
        ],
    )

    sync._sync_benchmark(db_session, account_id)

    rows = (
        db_session.query(BenchmarkData)
        .filter(BenchmarkData.symbol == "SPY")
        .order_by(BenchmarkData.date)
        .all()
    )

    assert len(rows) == 2
    assert rows[0].date == date(2025, 1, 2)
    assert rows[0].close == 500.0
    assert rows[1].date == date(2025, 1, 3)
    assert rows[1].close == 505.0
