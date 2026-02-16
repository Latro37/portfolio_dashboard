"""SQLAlchemy database engine and session management."""

import os
import logging

from sqlalchemy import create_engine, text as sa_text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()

# Ensure data directory exists for SQLite
db_url = settings.database_url
if db_url.startswith("sqlite:///"):
    db_path = db_url.replace("sqlite:///", "")
    if not os.path.isabs(db_path):
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        db_path = os.path.join(root, db_path)
        db_url = f"sqlite:///{db_path}"
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

engine = create_engine(db_url, echo=False)
SessionLocal = sessionmaker(bind=engine)


def get_db():
    """FastAPI dependency that yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables and run lightweight migrations for schema changes."""
    Base.metadata.create_all(bind=engine)
    _migrate_add_columns()


def _migrate_add_columns():
    """Add missing columns to existing tables (SQLite ALTER TABLE ADD COLUMN)."""
    from sqlalchemy import inspect as sa_inspect

    insp = sa_inspect(engine)

    # Map of (table_name, column_name, column_default_sql)
    _MIGRATIONS = [
        ("symphony_backtest_cache", "summary_metrics_json", "TEXT NOT NULL DEFAULT '{}'"),
        ("symphony_backtest_cache", "last_semantic_update_at", "TEXT"),
        ("daily_metrics", "annualized_return_cum", "REAL DEFAULT 0.0"),
        ("symphony_daily_metrics", "annualized_return_cum", "REAL DEFAULT 0.0"),
        ("cash_flows", "is_manual", "INTEGER NOT NULL DEFAULT 0"),
    ]

    with engine.connect() as conn:
        for table, col, col_type in _MIGRATIONS:
            if table not in insp.get_table_names():
                continue
            existing_cols = {c["name"] for c in insp.get_columns(table)}
            if col in existing_cols:
                continue
            stmt = f'ALTER TABLE "{table}" ADD COLUMN "{col}" {col_type}'
            conn.execute(sa_text(stmt))
            conn.commit()
            logging.getLogger(__name__).info("Migration: added column %s.%s", table, col)

        # Backfill legacy manual cash-flow rows created before `is_manual` existed.
        insp_after = sa_inspect(engine)
        if "cash_flows" in insp_after.get_table_names():
            cash_flow_cols = {c["name"] for c in insp_after.get_columns("cash_flows")}
            if "is_manual" in cash_flow_cols:
                conn.execute(
                    sa_text(
                        """
                        UPDATE cash_flows
                        SET is_manual = 1
                        WHERE is_manual = 0
                          AND lower(COALESCE(description, '')) LIKE 'manual%'
                          AND lower(COALESCE(type, '')) IN ('deposit', 'withdrawal')
                        """
                    )
                )
                conn.commit()
