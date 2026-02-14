"""Shared account-scope resolution helpers for API routers."""

from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import is_test_mode
from app.models import Account


def resolve_account_ids(
    db: Session,
    account_id: Optional[str],
    *,
    no_accounts_message: str = "No accounts discovered.",
) -> List[str]:
    """Resolve account selector into one or more sub-account IDs.

    - None -> first visible sub-account (backward compatibility)
    - "<uuid>" -> specific sub-account
    - "all" -> all visible sub-accounts
    - "all:<credential_name>" -> all visible sub-accounts under one credential
    """
    test_mode = is_test_mode()

    if account_id == "all":
        query = db.query(Account)
        if test_mode:
            query = query.filter(Account.credential_name == "__TEST__")
        else:
            query = query.filter(Account.credential_name != "__TEST__")
        accts = query.all()
        if not accts:
            raise HTTPException(404, no_accounts_message)
        return [a.id for a in accts]

    if account_id and account_id.startswith("all:"):
        cred_name = account_id[4:]
        if test_mode and cred_name != "__TEST__":
            raise HTTPException(404, "Only __TEST__ accounts are available in test mode")
        if not test_mode and cred_name == "__TEST__":
            raise HTTPException(404, "Test mode is not enabled")
        accts = db.query(Account).filter_by(credential_name=cred_name).all()
        if not accts:
            raise HTTPException(404, f"No sub-accounts found for credential '{cred_name}'")
        return [a.id for a in accts]

    if account_id:
        acct = db.query(Account).filter_by(id=account_id).first()
        if not acct:
            raise HTTPException(404, f"Account {account_id} not found")
        if test_mode and acct.credential_name != "__TEST__":
            raise HTTPException(404, "Only __TEST__ accounts are available in test mode")
        if not test_mode and acct.credential_name == "__TEST__":
            raise HTTPException(404, "Test mode is not enabled")
        return [account_id]

    query = db.query(Account)
    if test_mode:
        query = query.filter(Account.credential_name == "__TEST__")
    else:
        query = query.filter(Account.credential_name != "__TEST__")
    first = query.first()
    if not first:
        raise HTTPException(404, no_accounts_message)
    return [first.id]
