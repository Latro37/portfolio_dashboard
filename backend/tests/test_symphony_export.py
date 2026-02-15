from __future__ import annotations

from datetime import date as _real_date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import SyncState
from app.services import symphony_export


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
    def get_symphony_stats(self, _account_id: str):
        return [{"id": "inv-1", "name": "Invested"}]

    def get_drafts(self):
        # Use identical names to ensure exports don't overwrite each other.
        return [{"id": "draft-1", "name": "My Draft"}, {"symphony_id": "draft-2", "name": "My Draft"}]

    def get_symphony_versions(self, symphony_id: str):
        if symphony_id == "inv-1":
            return [{"created_at": "2025-01-01T00:00:00Z"}]
        return []  # Drafts (and sometimes invested symphonies) can have no versions.

    def get_symphony_score(self, symphony_id: str):
        return {"id": symphony_id, "nodes": [], "meta": {"name": symphony_id}}


def test_export_all_symphonies_includes_drafts_and_avoids_name_collisions(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    export_dir = tmp_path / "exports"

    # Deterministic file names for assertions.
    class _FixedDate(_real_date):
        @classmethod
        def today(cls):
            return _real_date(2025, 1, 2)

    monkeypatch.setattr(symphony_export, "date", _FixedDate)
    monkeypatch.setattr(symphony_export.time, "sleep", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(symphony_export, "load_symphony_export_config", lambda: {"local_path": str(export_dir)})

    client = _StubClient()
    account_id = "acct-001"

    symphony_export.export_all_symphonies(db_session, client, account_id=account_id)

    # Drafts with the same name should both exist as separate files (ID in filename).
    draft_folder = export_dir / "My Draft"
    draft_files = sorted(p.name for p in draft_folder.glob("*.json"))
    assert draft_files == [
        "My Draft_draft-1_2025-01-02.json",
        "My Draft_draft-2_2025-01-02.json",
    ]

    # Timestamp-based state is used when versions provide timestamps.
    inv_state = (
        db_session.query(SyncState)
        .filter_by(account_id=account_id, key="symphony_export:inv-1")
        .first()
    )
    assert inv_state is not None
    assert inv_state.value == "2025-01-01T00:00:00Z"

    # Hash-based state is used when versions are unavailable.
    for sid in ("draft-1", "draft-2"):
        row = (
            db_session.query(SyncState)
            .filter_by(account_id=account_id, key=f"symphony_export_hash:{sid}")
            .first()
        )
        assert row is not None
        assert isinstance(row.value, str)
        assert len(row.value) == 64  # sha256 hex

    # Second run should be a no-op (no files written) based on state.
    def _unexpected_save(*_args, **_kwargs):
        raise AssertionError("export attempted when no changes were present")

    monkeypatch.setattr(symphony_export, "_save_local", _unexpected_save)
    symphony_export.export_all_symphonies(db_session, client, account_id=account_id)

