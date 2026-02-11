"""Symphony structure export: save latest version JSON locally."""

import json
import logging
import os
import re
import time
from datetime import date
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.composer_client import ComposerClient
from app.config import load_symphony_export_config
from app.models import SyncState

logger = logging.getLogger(__name__)

# Characters not allowed in file/folder names (Windows + Unix)
_UNSAFE_CHARS = re.compile(r'[\\/:*?"<>|]+')


def _sanitize_name(name: str) -> str:
    """Sanitize a symphony name for use as a filesystem folder/file name."""
    cleaned = _UNSAFE_CHARS.sub("_", name).strip(". ")
    return cleaned or "unnamed"


def _get_sync_state(db: Session, account_id: str, key: str) -> Optional[str]:
    row = db.query(SyncState).filter_by(account_id=account_id, key=key).first()
    return row.value if row else None


def _set_sync_state(db: Session, account_id: str, key: str, value: str):
    row = db.query(SyncState).filter_by(account_id=account_id, key=key).first()
    if row:
        row.value = value
    else:
        db.add(SyncState(account_id=account_id, key=key, value=value))
    db.commit()


def _save_local(local_path: str, symphony_name: str, version_json: dict) -> Optional[str]:
    """Write symphony version JSON to local disk. Returns the file path on success."""
    folder_name = _sanitize_name(symphony_name)
    folder = os.path.join(local_path, folder_name)
    os.makedirs(folder, exist_ok=True)

    today_str = date.today().isoformat()
    filename = f"{folder_name}_{today_str}.json"
    filepath = os.path.join(folder, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(version_json, f, indent=2, ensure_ascii=False)
        f.write("\n")

    logger.info("Saved symphony '%s' to %s", symphony_name, filepath)
    return filepath


def export_single_symphony(
    client: ComposerClient,
    symphony_id: str,
    symphony_name: str,
    config: Optional[dict] = None,
):
    """Export the latest version of a single symphony. Used for on-demand edit detection."""
    if config is None:
        config = load_symphony_export_config()
    if not config:
        return

    local_path = config.get("local_path", "")
    if not local_path:
        return

    score = client.get_symphony_score(symphony_id)
    if not score:
        return

    _save_local(local_path, symphony_name, score)


def export_all_symphonies(db: Session, client: ComposerClient, account_id: str):
    """Export latest version of all symphonies if they have changed since last export.

    Called as a sync step in full_backfill() and incremental_update().
    """
    config = load_symphony_export_config()
    if not config:
        return

    local_path = config.get("local_path", "")
    if not local_path:
        logger.debug("Symphony export skipped — no local_path configured")
        return

    try:
        symphonies = client.get_symphony_stats(account_id)
    except Exception as e:
        logger.warning("Failed to fetch symphony stats for export (%s): %s", account_id, e)
        return

    exported = 0

    for s in symphonies:
        sym_id = s.get("id", "")
        sym_name = s.get("name", "Unknown")
        if not sym_id:
            continue

        # Use versions endpoint for lightweight change detection
        try:
            versions = client.get_symphony_versions(sym_id)
        except Exception as e:
            logger.warning("Failed to fetch versions for symphony %s: %s", sym_id, e)
            continue

        if not versions:
            continue

        latest = versions[0] if isinstance(versions, list) else versions
        latest_ts = latest.get("created_at") or latest.get("updated_at") or ""

        # Check if we already exported this version
        state_key = f"symphony_export:{sym_id}"
        last_exported = _get_sync_state(db, account_id, state_key)
        if last_exported and latest_ts and last_exported >= latest_ts:
            continue

        # Fetch full structure via /score
        score = client.get_symphony_score(sym_id)
        if not score:
            continue

        _save_local(local_path, sym_name, score)

        if latest_ts:
            _set_sync_state(db, account_id, state_key, latest_ts)

        exported += 1
        time.sleep(0.3)  # gentle rate limit between version fetches

    logger.info("Symphony export for %s: %d exported, %d total", account_id, exported, len(symphonies))
