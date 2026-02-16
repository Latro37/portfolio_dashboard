from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import CashFlow, DailyPortfolio
from app.services.sync import _roll_forward_cash_flow_totals, _sync_portfolio_history


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
    def __init__(self, history: list[dict]):
        self._history = history

    def get_portfolio_history(self, _account_id: str):
        return list(self._history)

    def get_cash_balance(self, _account_id: str) -> float:
        return 0.0

    def get_total_stats(self, _account_id: str):
        return {"net_deposits": 0.0}


def test_sync_portfolio_history_rolls_cash_flows_forward_to_next_market_day(
    db_session: Session,
):
    account_id = "acct-1"
    db_session.add(
        CashFlow(
            account_id=account_id,
            date=date(2024, 1, 6),  # Saturday
            type="deposit",
            amount=100.0,
            description="Manual weekend deposit",
        )
    )
    db_session.commit()

    client = _StubClient(
        history=[
            {"date": "2024-01-05", "portfolio_value": 1_000.0},  # Friday
            {"date": "2024-01-08", "portfolio_value": 1_010.0},  # Monday
        ]
    )

    _sync_portfolio_history(db_session, client, account_id)

    rows = (
        db_session.query(DailyPortfolio)
        .filter_by(account_id=account_id)
        .order_by(DailyPortfolio.date)
        .all()
    )
    assert [str(r.date) for r in rows] == ["2024-01-05", "2024-01-08"]
    assert [r.net_deposits for r in rows] == [0.0, 100.0]


def test_sync_portfolio_history_carries_cumulative_cash_flow_between_dates(
    db_session: Session,
):
    account_id = "acct-2"
    db_session.add_all(
        [
            CashFlow(
                account_id=account_id,
                date=date(2024, 1, 2),
                type="deposit",
                amount=100.0,
                description="Initial deposit",
            ),
            CashFlow(
                account_id=account_id,
                date=date(2024, 1, 4),
                type="withdrawal",
                amount=-25.0,
                description="Withdrawal",
            ),
        ]
    )
    db_session.commit()

    client = _StubClient(
        history=[
            {"date": "2024-01-02", "portfolio_value": 1_000.0},
            {"date": "2024-01-03", "portfolio_value": 1_020.0},
            {"date": "2024-01-04", "portfolio_value": 1_030.0},
        ]
    )

    _sync_portfolio_history(db_session, client, account_id)

    rows = (
        db_session.query(DailyPortfolio)
        .filter_by(account_id=account_id)
        .order_by(DailyPortfolio.date)
        .all()
    )
    assert [r.net_deposits for r in rows] == [100.0, 100.0, 75.0]


def test_roll_forward_cash_flow_totals_preserves_baseline_without_cash_flows(
    db_session: Session,
):
    account_id = "acct-3"
    db_session.add_all(
        [
            DailyPortfolio(
                account_id=account_id,
                date=date(2024, 1, 5),
                portfolio_value=1_000.0,
                net_deposits=500.0,
                total_fees=0.0,
                total_dividends=0.0,
            ),
            DailyPortfolio(
                account_id=account_id,
                date=date(2024, 1, 8),
                portfolio_value=1_020.0,
                net_deposits=500.0,
                total_fees=0.0,
                total_dividends=0.0,
            ),
        ]
    )
    db_session.commit()

    _roll_forward_cash_flow_totals(db_session, account_id, preserve_baseline=True)

    rows = (
        db_session.query(DailyPortfolio)
        .filter_by(account_id=account_id)
        .order_by(DailyPortfolio.date)
        .all()
    )
    assert [r.net_deposits for r in rows] == [500.0, 500.0]


def test_roll_forward_cash_flow_totals_applies_cash_flows_on_top_of_baseline(
    db_session: Session,
):
    account_id = "acct-4"
    db_session.add_all(
        [
            DailyPortfolio(
                account_id=account_id,
                date=date(2024, 1, 5),
                portfolio_value=1_000.0,
                net_deposits=500.0,
                total_fees=0.0,
                total_dividends=0.0,
            ),
            DailyPortfolio(
                account_id=account_id,
                date=date(2024, 1, 8),
                portfolio_value=1_020.0,
                net_deposits=500.0,
                total_fees=0.0,
                total_dividends=0.0,
            ),
            CashFlow(
                account_id=account_id,
                date=date(2024, 1, 6),  # weekend deposit should roll to Monday
                type="deposit",
                amount=100.0,
                description="Manual weekend deposit",
            ),
        ]
    )
    db_session.commit()

    _roll_forward_cash_flow_totals(db_session, account_id, preserve_baseline=True)

    rows = (
        db_session.query(DailyPortfolio)
        .filter_by(account_id=account_id)
        .order_by(DailyPortfolio.date)
        .all()
    )
    assert [r.net_deposits for r in rows] == [500.0, 600.0]
