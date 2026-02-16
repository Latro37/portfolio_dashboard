from __future__ import annotations

from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import DailyPortfolio
from app.schemas import ManualCashFlowRequest
from app.services.portfolio_admin import add_manual_cash_flow_data
from app.services.sync import _sync_portfolio_history


class _StubClient:
    def __init__(self, history: list[dict]):
        self._history = history

    def get_portfolio_history(self, _account_id: str):
        return list(self._history)

    def get_cash_balance(self, _account_id: str) -> float:
        return 0.0

    def get_total_stats(self, _account_id: str):
        return {"net_deposits": 1000.0}


def test_manual_cash_flow_recompute_matches_sync_roll_forward_behavior():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    db = Session(engine)
    try:
        account_id = "acct-1"
        db.add_all(
            [
                DailyPortfolio(
                    account_id=account_id,
                    date=date(2024, 1, 2),
                    portfolio_value=1000.0,
                    net_deposits=1000.0,
                    total_fees=0.0,
                    total_dividends=0.0,
                ),
                DailyPortfolio(
                    account_id=account_id,
                    date=date(2024, 1, 3),
                    portfolio_value=1010.0,
                    net_deposits=1000.0,
                    total_fees=0.0,
                    total_dividends=0.0,
                ),
            ]
        )
        db.commit()

        add_manual_cash_flow_data(
            db,
            ManualCashFlowRequest(
                account_id=account_id,
                date=date(2024, 1, 2),
                type="deposit",
                amount=250.0,
                description="Manual baseline correction",
            ),
            resolve_account_ids_fn=lambda _db, _aid: [account_id],
            get_client_for_account_fn=lambda _db, _aid: _StubClient([]),
        )

        before_sync = [
            row.net_deposits
            for row in db.query(DailyPortfolio)
            .filter_by(account_id=account_id)
            .order_by(DailyPortfolio.date)
            .all()
        ]

        _sync_portfolio_history(
            db,
            _StubClient(
                history=[
                    {"date": "2024-01-02", "portfolio_value": 1000.0},
                    {"date": "2024-01-03", "portfolio_value": 1010.0},
                ]
            ),
            account_id,
        )

        after_sync = [
            row.net_deposits
            for row in db.query(DailyPortfolio)
            .filter_by(account_id=account_id)
            .order_by(DailyPortfolio.date)
            .all()
        ]

        assert before_sync == after_sync
    finally:
        db.close()
        engine.dispose()
