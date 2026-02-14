from __future__ import annotations

from typing import Iterable

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.models import Account
from app.services.account_scope import resolve_account_ids


def _build_session(accounts: Iterable[Account]) -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine, tables=[Account.__table__])
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    for acct in accounts:
        db.add(acct)
    db.commit()
    return db


def _acct(aid: str, cred: str, display: str) -> Account:
    return Account(
        id=aid,
        credential_name=cred,
        account_type="INDIVIDUAL",
        display_name=display,
        status="ACTIVE",
    )


def test_resolve_account_ids_normal_mode(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("PD_TEST_MODE", raising=False)
    monkeypatch.delenv("CPV_TEST_MODE", raising=False)
    db = _build_session(
        [
            _acct("real-1", "Primary", "Primary: Main"),
            _acct("test-1", "__TEST__", "Test: Main"),
            _acct("real-2", "Primary", "Primary: IRA"),
        ]
    )
    try:
        assert resolve_account_ids(db, "all") == ["real-1", "real-2"]
        assert resolve_account_ids(db, "all:Primary") == ["real-1", "real-2"]
        assert resolve_account_ids(db, None) == ["real-1"]
    finally:
        db.close()


def test_resolve_account_ids_test_mode(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PD_TEST_MODE", "1")
    db = _build_session(
        [
            _acct("real-1", "Primary", "Primary: Main"),
            _acct("test-1", "__TEST__", "Test: Main"),
        ]
    )
    try:
        assert resolve_account_ids(db, "all") == ["test-1"]
        assert resolve_account_ids(db, None) == ["test-1"]
        with pytest.raises(HTTPException, match="Only __TEST__ accounts are available in test mode"):
            resolve_account_ids(db, "all:Primary")
        with pytest.raises(HTTPException, match="Only __TEST__ accounts are available in test mode"):
            resolve_account_ids(db, "real-1")
    finally:
        db.close()


def test_resolve_account_ids_rejects_test_in_normal_mode(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("PD_TEST_MODE", raising=False)
    monkeypatch.delenv("CPV_TEST_MODE", raising=False)
    db = _build_session([_acct("test-1", "__TEST__", "Test: Main")])
    try:
        with pytest.raises(HTTPException, match="Test mode is not enabled"):
            resolve_account_ids(db, "test-1")
    finally:
        db.close()


def test_resolve_account_ids_no_accounts_message(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("PD_TEST_MODE", raising=False)
    monkeypatch.delenv("CPV_TEST_MODE", raising=False)
    db = _build_session([])
    try:
        with pytest.raises(HTTPException, match="No accounts discovered\\. Check config\\.json and restart\\."):
            resolve_account_ids(
                db,
                None,
                no_accounts_message="No accounts discovered. Check config.json and restart.",
            )
    finally:
        db.close()
