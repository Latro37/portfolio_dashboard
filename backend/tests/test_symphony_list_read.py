from __future__ import annotations

from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Account, SymphonyDailyMetrics, SymphonyDailyPortfolio
from app.services import symphony_list_read


def test_test_symphony_list_falls_back_to_db_when_meta_missing(monkeypatch):
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
        account_id = "test-account-001"
        symphony_id = "test-sym-000"
        db.add(
            Account(
                id=account_id,
                credential_name="__TEST__",
                account_type="INDIVIDUAL",
                display_name="Test: Main",
                status="ACTIVE",
            )
        )
        db.add(
            SymphonyDailyPortfolio(
                account_id=account_id,
                symphony_id=symphony_id,
                date=date(2025, 1, 2),
                portfolio_value=52000.0,
                net_deposits=50000.0,
            )
        )
        db.add(
            SymphonyDailyMetrics(
                account_id=account_id,
                symphony_id=symphony_id,
                date=date(2025, 1, 2),
                daily_return_pct=0.75,
                cumulative_return_pct=4.0,
                time_weighted_return=4.0,
                sharpe_ratio=1.2,
                max_drawdown=-3.5,
                annualized_return=9.5,
            )
        )
        db.commit()

        monkeypatch.setattr(symphony_list_read, "_TEST_META_PATH", "missing/test_symphony_meta.json")

        rows = symphony_list_read.get_symphonies_list_data(
            db=db,
            account_id=account_id,
            get_client_for_account_fn=lambda *_args, **_kwargs: None,
        )

        assert len(rows) == 1
        row = rows[0]
        assert row["id"] == symphony_id
        assert row["account_id"] == account_id
        assert row["value"] == 52000.0
        assert row["net_deposits"] == 50000.0
        assert row["time_weighted_return"] == 4.0
        assert row["cumulative_return_pct"] == 4.0
    finally:
        db.close()
        engine.dispose()
