from __future__ import annotations

import threading
import time

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Account
from app.services import symphony_export_jobs


@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture(autouse=True)
def _reset_job_state():
    # Keep tests isolated since the job state is a module-level singleton.
    with symphony_export_jobs._job_lock:
        symphony_export_jobs._job_state.update(
            {
                "status": "idle",
                "job_id": None,
                "exported": 0,
                "processed": 0,
                "total": None,
                "message": "",
                "error": None,
            }
        )


def test_symphony_export_job_groups_drafts_once_per_credential(engine, monkeypatch: pytest.MonkeyPatch):
    session = Session(engine)
    try:
        session.add_all(
            [
                Account(
                    id="acct-001",
                    credential_name="Primary",
                    account_type="INDIVIDUAL",
                    display_name="One",
                    status="ACTIVE",
                ),
                Account(
                    id="acct-002",
                    credential_name="Primary",
                    account_type="INDIVIDUAL",
                    display_name="Two",
                    status="ACTIVE",
                ),
                Account(
                    id="acct-003",
                    credential_name="Secondary",
                    account_type="INDIVIDUAL",
                    display_name="Three",
                    status="ACTIVE",
                ),
            ]
        )
        session.commit()
    finally:
        session.close()

    allow_finish = threading.Event()
    calls: list[tuple[str, bool]] = []
    calls_lock = threading.Lock()
    expected_calls = 3

    def _session_local():
        return Session(engine)

    def _get_client(_db, _account_id: str):
        return object()

    def _export(
        *,
        db,
        client,
        account_id: str,
        include_drafts: bool = True,
        progress_cb=None,
    ):
        del db, client
        with calls_lock:
            calls.append((account_id, bool(include_drafts)))
            call_count = len(calls)

        total_targets = 3 if include_drafts else 1
        if progress_cb:
            progress_cb({"event": "targets", "total": total_targets})
            for _ in range(total_targets):
                progress_cb({"event": "processed", "exported": True})

        # Hold the background thread open after all expected calls so the test
        # can observe the "running" state and counters deterministically.
        if call_count == expected_calls:
            allow_finish.wait(timeout=5)

    monkeypatch.setattr(symphony_export_jobs, "SessionLocal", _session_local)
    monkeypatch.setattr(symphony_export_jobs, "get_client_for_account", _get_client)
    monkeypatch.setattr(symphony_export_jobs, "export_all_symphonies_with_options", _export)

    job_id = symphony_export_jobs.start_symphony_export_job(["acct-001", "acct-002", "acct-003"])

    deadline = time.time() + 5
    while time.time() < deadline:
        with calls_lock:
            if len(calls) == expected_calls:
                break
        time.sleep(0.01)

    with calls_lock:
        assert len(calls) == expected_calls
        assert ("acct-001", True) in calls  # drafts once for Primary credential
        assert ("acct-002", False) in calls
        assert ("acct-003", True) in calls  # drafts once for Secondary credential

    status = symphony_export_jobs.get_symphony_export_job_status()
    assert status["status"] == "running"
    assert status["job_id"] == job_id
    assert status["total"] == 7  # (3 + 1) for Primary, (3) for Secondary
    assert status["processed"] == 7
    assert status["exported"] == 7

    allow_finish.set()

    deadline = time.time() + 5
    while time.time() < deadline:
        status = symphony_export_jobs.get_symphony_export_job_status()
        if status["status"] in {"complete", "error"}:
            break
        time.sleep(0.01)

    status = symphony_export_jobs.get_symphony_export_job_status()
    assert status["status"] == "complete"
    assert status["job_id"] == job_id
    assert status["exported"] == 7
    assert status["processed"] == 7
    assert status["error"] is None


def test_start_returns_existing_job_id_while_running(engine, monkeypatch: pytest.MonkeyPatch):
    session = Session(engine)
    try:
        session.add(
            Account(
                id="acct-001",
                credential_name="Primary",
                account_type="INDIVIDUAL",
                display_name="One",
                status="ACTIVE",
            )
        )
        session.commit()
    finally:
        session.close()

    allow_finish = threading.Event()

    def _session_local():
        return Session(engine)

    def _get_client(_db, _account_id: str):
        return object()

    def _export(*, db, client, account_id: str, include_drafts: bool = True, progress_cb=None):
        del db, client, account_id, include_drafts
        if progress_cb:
            progress_cb({"event": "targets", "total": 1})
            progress_cb({"event": "processed", "exported": True})
        allow_finish.wait(timeout=5)

    monkeypatch.setattr(symphony_export_jobs, "SessionLocal", _session_local)
    monkeypatch.setattr(symphony_export_jobs, "get_client_for_account", _get_client)
    monkeypatch.setattr(symphony_export_jobs, "export_all_symphonies_with_options", _export)

    job_id_1 = symphony_export_jobs.start_symphony_export_job(["acct-001"])
    job_id_2 = symphony_export_jobs.start_symphony_export_job(["acct-001"])
    assert job_id_2 == job_id_1

    allow_finish.set()

    deadline = time.time() + 5
    while time.time() < deadline:
        status = symphony_export_jobs.get_symphony_export_job_status()
        if status["status"] in {"complete", "error"}:
            break
        time.sleep(0.01)

    status = symphony_export_jobs.get_symphony_export_job_status()
    assert status["status"] == "complete"
