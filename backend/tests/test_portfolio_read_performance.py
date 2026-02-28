from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import CashFlow, DailyMetrics, DailyPortfolio
from app.services.metrics import compute_performance_series
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


def _seed_metric_rows(
    db: Session,
    *,
    account_id: str,
    rows: list[tuple[date, float, float, float, float, float]],
) -> None:
    for row_date, daily_return, cumulative_return, twr, mwr, drawdown in rows:
        db.add(
            DailyMetrics(
                account_id=account_id,
                date=row_date,
                daily_return_pct=daily_return,
                cumulative_return_pct=cumulative_return,
                time_weighted_return=twr,
                money_weighted_return=mwr,
                money_weighted_return_period=mwr,
                current_drawdown=drawdown,
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


def test_single_account_recomputes_window_mwr_from_cash_flows():
    db, engine = _build_session()
    try:
        account_id = "acct-1"
        daily_rows = [
            (date(2025, 1, 1), 100.0, 100.0),
            (date(2025, 1, 2), 110.0, 100.0),
            (date(2025, 1, 3), 165.0, 150.0),
            (date(2025, 1, 4), 180.0, 150.0),
            (date(2025, 1, 5), 210.0, 170.0),
        ]
        cash_flows = [
            (date(2025, 1, 1), "deposit", 100.0),
            (date(2025, 1, 3), "deposit", 50.0),
            (date(2025, 1, 5), "deposit", 20.0),
        ]
        _seed_daily_rows(db, account_id=account_id, rows=daily_rows)
        _seed_cash_flows(db, account_id=account_id, rows=cash_flows)

        full_input = [
            {"date": row_date, "portfolio_value": portfolio_value, "net_deposits": net_deposits}
            for row_date, portfolio_value, net_deposits in daily_rows
        ]
        full_cash = [{"date": flow_date, "amount": amount} for flow_date, _, amount in cash_flows]
        full_perf = compute_performance_series(full_input, full_cash)
        _seed_metric_rows(
            db,
            account_id=account_id,
            rows=[
                (
                    daily_rows[idx][0],
                    row["daily_return_pct"],
                    row["cumulative_return_pct"],
                    row["time_weighted_return"],
                    row["money_weighted_return"],
                    row["current_drawdown"],
                )
                for idx, row in enumerate(full_perf)
            ],
        )
        db.commit()

        series = get_portfolio_performance_data(
            db=db,
            account_ids=[account_id],
            period=None,
            start_date="2025-01-03",
            end_date="2025-01-05",
        )

        window_input = [
            {"date": row_date, "portfolio_value": portfolio_value, "net_deposits": net_deposits}
            for row_date, portfolio_value, net_deposits in daily_rows
            if row_date >= date(2025, 1, 3)
        ]
        window_cash = [
            {"date": flow_date, "amount": amount}
            for flow_date, _, amount in cash_flows
            if flow_date >= date(2025, 1, 3)
        ]
        expected = compute_performance_series(window_input, window_cash)

        assert [point["date"] for point in series] == [point["date"] for point in expected]
        assert [point["money_weighted_return"] for point in series] == pytest.approx(
            [point["money_weighted_return"] for point in expected],
            abs=0.0001,
        )
    finally:
        db.close()
        engine.dispose()


def test_single_account_partial_metric_rows_recompute_series():
    db, engine = _build_session()
    try:
        account_id = "acct-1"
        daily_rows = [
            (date(2025, 1, 1), 100.0, 100.0),
            (date(2025, 1, 2), 120.0, 100.0),
            (date(2025, 1, 3), 125.0, 110.0),
        ]
        cash_flows = [
            (date(2025, 1, 1), "deposit", 100.0),
            (date(2025, 1, 3), "deposit", 10.0),
        ]
        _seed_daily_rows(db, account_id=account_id, rows=daily_rows)
        _seed_cash_flows(db, account_id=account_id, rows=cash_flows)

        expected = compute_performance_series(
            [
                {"date": row_date, "portfolio_value": portfolio_value, "net_deposits": net_deposits}
                for row_date, portfolio_value, net_deposits in daily_rows
            ],
            [{"date": flow_date, "amount": amount} for flow_date, _, amount in cash_flows],
        )

        # Seed only one metrics row to emulate interrupted sync.
        first = expected[0]
        _seed_metric_rows(
            db,
            account_id=account_id,
            rows=[
                (
                    daily_rows[0][0],
                    first["daily_return_pct"],
                    first["cumulative_return_pct"],
                    first["time_weighted_return"],
                    first["money_weighted_return"],
                    first["current_drawdown"],
                )
            ],
        )
        db.commit()

        series = get_portfolio_performance_data(
            db=db,
            account_ids=[account_id],
            period=None,
            start_date="2025-01-01",
            end_date="2025-01-03",
        )

        assert [point["daily_return_pct"] for point in series] == pytest.approx(
            [point["daily_return_pct"] for point in expected],
            abs=0.0001,
        )
        assert [point["money_weighted_return"] for point in series] == pytest.approx(
            [point["money_weighted_return"] for point in expected],
            abs=0.0001,
        )
    finally:
        db.close()
        engine.dispose()
