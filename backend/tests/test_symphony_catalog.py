from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.services.symphony_catalog as symphony_catalog
from app.database import Base
from app.models import Account, SymphonyCatalogEntry


def _build_session():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    return session, engine


def test_refresh_catalog_prunes_stale_rows_without_errors(monkeypatch: pytest.MonkeyPatch):
    db, engine = _build_session()
    try:
        db.add(
            SymphonyCatalogEntry(
                symphony_id="stale",
                name="Stale Symphony",
                source="watchlist",
                credential_name="Primary",
                updated_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

        monkeypatch.setattr(symphony_catalog, "load_accounts", lambda: [])

        symphony_catalog._refresh_symphony_catalog(db)

        rows = db.query(SymphonyCatalogEntry).all()
        assert rows == []
    finally:
        db.close()
        engine.dispose()


def test_refresh_catalog_keeps_existing_rows_when_refresh_has_errors(
    monkeypatch: pytest.MonkeyPatch,
):
    db, engine = _build_session()
    try:
        db.add(
            Account(
                id="acct-1",
                credential_name="Primary",
                account_type="INDIVIDUAL",
                display_name="Primary",
                status="ACTIVE",
            )
        )
        db.add(
            SymphonyCatalogEntry(
                symphony_id="stale",
                name="Stale Symphony",
                source="watchlist",
                credential_name="Primary",
                updated_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

        cred = type("Cred", (), {"name": "Primary"})()

        class _Client:
            def get_symphony_stats(self, _account_id: str):
                raise RuntimeError("failed")

            def get_watchlist(self):
                return []

            def get_drafts(self):
                return []

        class _ComposerClient:
            @staticmethod
            def from_credentials(_creds):
                return _Client()

        monkeypatch.setattr(symphony_catalog, "load_accounts", lambda: [cred])
        monkeypatch.setattr(symphony_catalog, "ComposerClient", _ComposerClient)

        symphony_catalog._refresh_symphony_catalog(db)

        rows = db.query(SymphonyCatalogEntry).all()
        assert len(rows) == 1
        assert rows[0].symphony_id == "stale"
    finally:
        db.close()
        engine.dispose()
