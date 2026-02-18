from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import CashFlow, DailyPortfolio
from app.services.portfolio_read import get_portfolio_performance_data


def _seed_daily_rows(
    db: Session,
    *,
    account_id: str,
    rows: list[tuple[date, float, float]],
) -> None:
    for row_date, portfolio_value, net_deposits in rows:
        db.add(
            DailyPortfolio(
                account_id=account_id,
                date=row_date,
                portfolio_value=portfolio_value,
                net_deposits=net_deposits,
            )
        )


def _seed_cash_flows(
    db: Session,
    *,
    account_id: str,
    rows: list[tuple[date, str, float]],
) -> None:
    for flow_date, flow_type, amount in rows:
        db.add(
            CashFlow(
                account_id=account_id,
                date=flow_date,
                type=flow_type,
                amount=amount,
                description="test",
            )
        )


def _build_session() -> tuple[Session, object]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return Session(engine), engine


def test_single_account_custom_range_starts_metrics_at_zero():
    db, engine = _build_session()
    try:
        account_id = "acct-1"
        _seed_daily_rows(
            db,
            account_id=account_id,
            rows=[
                (date(2025, 1, 2), 100.0, 100.0),
                (date(2025, 1, 3), 104.0, 100.0),
                (date(2025, 1, 4), 109.0, 102.0),
            ],
        )
        _seed_cash_flows(
            db,
            account_id=account_id,
            rows=[
                (date(2025, 1, 2), "deposit", 100.0),
                (date(2025, 1, 4), "deposit", 2.0),
            ],
        )
        db.commit()

        series = get_portfolio_performance_data(
            db=db,
            account_ids=[account_id],
            period=None,
            start_date="2025-01-03",
            end_date="2025-01-04",
        )

        assert len(series) == 2
        assert series[0]["date"] == "2025-01-03"
        assert series[0]["time_weighted_return"] == 0.0
        assert series[0]["money_weighted_return"] == 0.0
        assert series[0]["current_drawdown"] == 0.0
        assert series[1]["time_weighted_return"] > 0.0
    finally:
        db.close()
        engine.dispose()


def test_multi_account_custom_range_starts_metrics_at_zero():
    db, engine = _build_session()
    try:
        account_ids = ["acct-1", "acct-2"]
        _seed_daily_rows(
            db,
            account_id=account_ids[0],
            rows=[
                (date(2025, 1, 2), 100.0, 100.0),
                (date(2025, 1, 3), 110.0, 100.0),
                (date(2025, 1, 4), 121.0, 100.0),
            ],
        )
        _seed_daily_rows(
            db,
            account_id=account_ids[1],
            rows=[
                (date(2025, 1, 2), 200.0, 200.0),
                (date(2025, 1, 3), 220.0, 200.0),
                (date(2025, 1, 4), 242.0, 200.0),
            ],
        )
        _seed_cash_flows(
            db,
            account_id=account_ids[0],
            rows=[(date(2025, 1, 2), "deposit", 100.0)],
        )
        _seed_cash_flows(
            db,
            account_id=account_ids[1],
            rows=[(date(2025, 1, 2), "deposit", 200.0)],
        )
        db.commit()

        series = get_portfolio_performance_data(
            db=db,
            account_ids=account_ids,
            period=None,
            start_date="2025-01-03",
            end_date="2025-01-04",
        )

        assert len(series) == 2
        assert series[0]["portfolio_value"] == 330.0
        assert series[0]["net_deposits"] == 300.0
        assert series[0]["time_weighted_return"] == 0.0
        assert series[0]["money_weighted_return"] == 0.0
        assert series[0]["current_drawdown"] == 0.0
        assert series[1]["time_weighted_return"] == pytest.approx(10.0, abs=0.0001)
    finally:
        db.close()
        engine.dispose()
