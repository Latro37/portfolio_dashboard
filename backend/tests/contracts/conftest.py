from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

import app.routers.portfolio as portfolio_router
from app.database import Base, get_db
from app.models import (
    Account,
    BenchmarkData,
    CashFlow,
    DailyMetrics,
    DailyPortfolio,
    SymphonyDailyMetrics,
    SymphonyDailyPortfolio,
)
from app.routers import portfolio, symphonies


@pytest.fixture
def session_factory(monkeypatch: pytest.MonkeyPatch):
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
        db.add(
            Account(
                id=account_id,
                credential_name="__TEST__",
                account_type="INDIVIDUAL",
                display_name="Test: Main",
                status="ACTIVE",
            )
        )

        start = date(2025, 1, 2)
        for idx, pv in enumerate([100000.0, 101000.0, 102500.0]):
            d = start + timedelta(days=idx)
            db.add(
                DailyPortfolio(
                    account_id=account_id,
                    date=d,
                    portfolio_value=pv,
                    cash_balance=5000.0,
                    net_deposits=100000.0,
                    total_fees=5.0 * idx,
                    total_dividends=2.0 * idx,
                )
            )
            db.add(
                DailyMetrics(
                    account_id=account_id,
                    date=d,
                    daily_return_pct=0.5 + idx,
                    cumulative_return_pct=1.0 + idx,
                    time_weighted_return=1.0 + idx,
                    money_weighted_return=0.9 + idx,
                    money_weighted_return_period=0.9 + idx,
                    current_drawdown=0.0,
                )
            )

        db.add(
            CashFlow(
                account_id=account_id,
                date=start,
                type="deposit",
                amount=100000.0,
                description="Initial deposit",
            )
        )

        sym_id = "test-sym-000"
        for idx, pv in enumerate([50000.0, 51000.0, 52000.0]):
            d = start + timedelta(days=idx)
            db.add(
                SymphonyDailyPortfolio(
                    account_id=account_id,
                    symphony_id=sym_id,
                    date=d,
                    portfolio_value=pv,
                    net_deposits=50000.0,
                )
            )
            db.add(
                SymphonyDailyMetrics(
                    account_id=account_id,
                    symphony_id=sym_id,
                    date=d,
                    daily_return_pct=0.5 + idx,
                    cumulative_return_pct=1.0 + idx,
                    time_weighted_return=1.0 + idx,
                    money_weighted_return=0.8 + idx,
                    money_weighted_return_period=0.8 + idx,
                    current_drawdown=0.0,
                )
            )

        for idx, close in enumerate([500.0, 505.0, 510.0]):
            d = start + timedelta(days=idx)
            db.add(BenchmarkData(date=d, symbol="SPY", close=close))

        db.commit()
        yield SessionLocal
    finally:
        db.close()
        engine.dispose()


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, session_factory):
    # Force benchmark route to use DB fallback (deterministic, offline).
    monkeypatch.setattr(portfolio_router, "get_daily_closes_stooq", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(portfolio_router, "get_daily_closes", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(portfolio_router, "get_latest_price", lambda *_args, **_kwargs: None)

    app = FastAPI()
    app.include_router(portfolio.router)
    app.include_router(symphonies.router)

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client
