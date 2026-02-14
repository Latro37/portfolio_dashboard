"""Shared Composer client resolution by sub-account."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.composer_client import ComposerClient
from app.config import load_accounts
from app.models import Account


def get_client_for_account(db: Session, account_id: str) -> ComposerClient:
    """Build a ComposerClient with the credentials for a given sub-account."""
    acct = db.query(Account).filter_by(id=account_id).first()
    if not acct:
        raise HTTPException(404, f"Account {account_id} not found")

    accounts_creds = load_accounts()
    for creds in accounts_creds:
        if creds.name == acct.credential_name:
            return ComposerClient.from_credentials(creds)

    raise HTTPException(500, f"No credentials found for credential name '{acct.credential_name}'")
