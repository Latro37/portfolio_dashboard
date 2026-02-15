"""Symphony catalog refresh/read service."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Dict, List

from sqlalchemy.orm import Session

from app.composer_client import ComposerClient
from app.config import load_accounts
from app.models import Account, SymphonyCatalogEntry

logger = logging.getLogger(__name__)

_CATALOG_TTL_SECONDS = 3600  # auto-refresh if older than 1 hour


def _refresh_symphony_catalog(db: Session) -> None:
    """Fetch invested, watchlist, and drafts across credentials and upsert."""
    accounts_creds = load_accounts()
    now = datetime.utcnow()
    entries: Dict[str, tuple] = {}

    for creds in accounts_creds:
        client = ComposerClient.from_credentials(creds)

        db_accounts = db.query(Account).filter_by(credential_name=creds.name).all()
        for acct in db_accounts:
            try:
                symphonies = client.get_symphony_stats(acct.id)
                for symphony in symphonies:
                    sid = symphony.get("id", "")
                    name = symphony.get("name", "")
                    if sid and name:
                        entries[sid] = (sid, name, "invested", creds.name)
            except Exception as exc:
                logger.warning("Catalog: failed invested fetch for %s/%s: %s", creds.name, acct.id, exc)

        try:
            watchlist = client.get_watchlist()
            for symphony in watchlist:
                sid = symphony.get("symphony_id", symphony.get("id", symphony.get("symphony_sid", "")))
                name = symphony.get("name", "")
                if sid and name and sid not in entries:
                    entries[sid] = (sid, name, "watchlist", creds.name)
        except Exception as exc:
            logger.warning("Catalog: failed watchlist fetch for %s: %s", creds.name, exc)

        try:
            drafts = client.get_drafts()
            for symphony in drafts:
                sid = symphony.get("symphony_id", symphony.get("id", symphony.get("symphony_sid", "")))
                name = symphony.get("name", "")
                if sid and name and sid not in entries:
                    entries[sid] = (sid, name, "draft", creds.name)
        except Exception as exc:
            logger.warning("Catalog: failed drafts fetch for %s: %s", creds.name, exc)

    for sid, name, source, cred_name in entries.values():
        existing = db.query(SymphonyCatalogEntry).filter_by(symphony_id=sid).first()
        if existing:
            existing.name = name
            existing.source = source
            existing.credential_name = cred_name
            existing.updated_at = now
        else:
            db.add(
                SymphonyCatalogEntry(
                    symphony_id=sid,
                    name=name,
                    source=source,
                    credential_name=cred_name,
                    updated_at=now,
                )
            )

    db.commit()
    logger.info("Symphony catalog refreshed: %d entries", len(entries))


def get_symphony_catalog_data(db: Session, refresh: bool = False) -> List[Dict]:
    """Return cached catalog rows, auto-refreshing when stale or forced."""
    from sqlalchemy import func

    latest = db.query(func.max(SymphonyCatalogEntry.updated_at)).scalar()
    is_stale = latest is None or (datetime.utcnow() - latest).total_seconds() > _CATALOG_TTL_SECONDS

    if refresh or is_stale:
        try:
            _refresh_symphony_catalog(db)
        except Exception as exc:
            logger.warning("Catalog refresh failed: %s", exc)
            if latest is None:
                return []

    rows = db.query(SymphonyCatalogEntry).order_by(SymphonyCatalogEntry.name).all()
    return [{"symphony_id": row.symphony_id, "name": row.name, "source": row.source} for row in rows]
