from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.services.symphony_read as symphony_read
from app.database import Base
from app.models import SymphonyDailyPortfolio
from app.services.symphony_read import (
    get_symphony_summary_live_data,
    invalidate_symphony_live_cache,
)


@pytest.fixture
def db_session(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PD_TEST_MODE", "1")
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


def test_live_summary_same_day_deposit_does_not_inflate_returns(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    class _FixedDate(date):
        @classmethod
        def today(cls):
            return cls(2026, 6, 2)

    monkeypatch.setattr(symphony_read, "date", _FixedDate)
    invalidate_symphony_live_cache()

    db_session.add_all(
        [
            SymphonyDailyPortfolio(
                account_id="acct-1",
                symphony_id="sym-1",
                date=date(2026, 6, 1),
                portfolio_value=100.0,
                net_deposits=100.0,
            ),
            SymphonyDailyPortfolio(
                account_id="acct-1",
                symphony_id="sym-1",
                date=date(2026, 6, 2),
                portfolio_value=100.0,
                net_deposits=100.0,
            ),
        ]
    )
    db_session.commit()

    summary = get_symphony_summary_live_data(
        db=db_session,
        symphony_id="sym-1",
        account_id="acct-1",
        live_pv=150.0,
        live_nd=150.0,
        period="ALL",
        start_date=None,
        end_date=None,
    )

    assert summary["daily_return_pct"] == pytest.approx(0.0)
    assert summary["time_weighted_return"] == pytest.approx(0.0)
    assert summary["money_weighted_return_period"] == pytest.approx(0.0)
    assert summary["portfolio_value"] == 150.0
    assert summary["net_deposits"] == 150.0

    invalidate_symphony_live_cache()
