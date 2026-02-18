from __future__ import annotations

from datetime import date as real_date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import SymphonyDailyPortfolio
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


class _StubClient:
    def __init__(self, *, stats: list[dict], histories: dict[str, list[dict]]):
        self._stats = stats
        self._histories = histories
        self.history_calls: list[str] = []

    def get_symphony_stats(self, _account_id: str):
        return list(self._stats)

    def get_symphony_history(self, _account_id: str, symphony_id: str):
        self.history_calls.append(symphony_id)
        return list(self._histories.get(symphony_id, []))


def _freeze_today(monkeypatch: pytest.MonkeyPatch, target: real_date) -> None:
    class _FixedDate(real_date):
        @classmethod
        def today(cls):  # type: ignore[override]
            return target

    monkeypatch.setattr(sync, "date", _FixedDate)
    monkeypatch.setattr(sync.time, "sleep", lambda *_args, **_kwargs: None)


def test_incremental_catches_up_missing_weekdays_before_today(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    _freeze_today(monkeypatch, real_date(2024, 1, 9))  # Tuesday
    account_id = "acct-1"
    sym_id = "sym-1"

    db_session.add(
        SymphonyDailyPortfolio(
            account_id=account_id,
            symphony_id=sym_id,
            date=real_date(2024, 1, 5),  # Friday
            portfolio_value=100.0,
            net_deposits=100.0,
        )
    )
    db_session.commit()

    client = _StubClient(
        stats=[{"id": sym_id, "value": 130.0, "net_deposits": 100.0}],
        histories={
            sym_id: [
                {"date": "2024-01-05", "value": 100.0, "deposit_adjusted_value": 100.0},
                {"date": "2024-01-08", "value": 120.0, "deposit_adjusted_value": 120.0},
                {"date": "2024-01-09", "value": 125.0, "deposit_adjusted_value": 125.0},
            ]
        },
    )

    sync._sync_symphony_daily_incremental(db_session, client, account_id)

    rows = (
        db_session.query(SymphonyDailyPortfolio)
        .filter_by(account_id=account_id, symphony_id=sym_id)
        .order_by(SymphonyDailyPortfolio.date)
        .all()
    )
    assert [str(row.date) for row in rows] == ["2024-01-05", "2024-01-08", "2024-01-09"]
    # Today's row comes from stats-meta in incremental mode.
    assert rows[-1].portfolio_value == 130.0
    assert client.history_calls == [sym_id]


def test_incremental_uses_stats_only_when_no_catchup_needed(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    _freeze_today(monkeypatch, real_date(2024, 1, 9))  # Tuesday
    account_id = "acct-2"
    sym_id = "sym-2"

    db_session.add(
        SymphonyDailyPortfolio(
            account_id=account_id,
            symphony_id=sym_id,
            date=real_date(2024, 1, 8),  # Monday
            portfolio_value=200.0,
            net_deposits=200.0,
        )
    )
    db_session.commit()

    client = _StubClient(
        stats=[{"id": sym_id, "value": 210.0, "net_deposits": 200.0}],
        histories={sym_id: []},
    )

    sync._sync_symphony_daily_incremental(db_session, client, account_id)

    rows = (
        db_session.query(SymphonyDailyPortfolio)
        .filter_by(account_id=account_id, symphony_id=sym_id)
        .order_by(SymphonyDailyPortfolio.date)
        .all()
    )
    assert [str(row.date) for row in rows] == ["2024-01-08", "2024-01-09"]
    assert rows[-1].portfolio_value == 210.0
    assert client.history_calls == []


def test_incremental_backfills_missing_weekday_on_weekend_without_today_write(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    _freeze_today(monkeypatch, real_date(2024, 1, 14))  # Sunday
    account_id = "acct-3"
    sym_id = "sym-3"

    db_session.add(
        SymphonyDailyPortfolio(
            account_id=account_id,
            symphony_id=sym_id,
            date=real_date(2024, 1, 11),  # Thursday
            portfolio_value=300.0,
            net_deposits=300.0,
        )
    )
    db_session.commit()

    client = _StubClient(
        stats=[{"id": sym_id, "value": 325.0, "net_deposits": 300.0}],
        histories={
            sym_id: [
                {"date": "2024-01-11", "value": 300.0, "deposit_adjusted_value": 300.0},
                {"date": "2024-01-12", "value": 310.0, "deposit_adjusted_value": 310.0},
                {"date": "2024-01-14", "value": 325.0, "deposit_adjusted_value": 325.0},
            ]
        },
    )

    sync._sync_symphony_daily_incremental(db_session, client, account_id)

    rows = (
        db_session.query(SymphonyDailyPortfolio)
        .filter_by(account_id=account_id, symphony_id=sym_id)
        .order_by(SymphonyDailyPortfolio.date)
        .all()
    )
    assert [str(row.date) for row in rows] == ["2024-01-11", "2024-01-12"]
    assert client.history_calls == [sym_id]

