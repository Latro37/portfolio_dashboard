"""Symphony structure export: save latest version JSON locally."""

import hashlib
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
from app.models import Account, SyncState
from app.services.local_paths import LocalPathError, resolve_local_write_path

logger = logging.getLogger(__name__)

# Characters not allowed in file/folder names (Windows + Unix)
_UNSAFE_CHARS = re.compile(r'[\\/:*?"<>|]+')
_DRAFTS_STATE_ACCOUNT_PREFIX = "__DRAFTS__:"


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


def _save_local(local_path: str, symphony_name: str, version_json: dict, symphony_id: str = "") -> Optional[str]:
    """Write symphony version JSON to local disk. Returns the file path on success."""
    folder_name = _sanitize_name(symphony_name)
    folder = os.path.join(local_path, folder_name)
    os.makedirs(folder, exist_ok=True)

    today_str = date.today().isoformat()
    id_part = _sanitize_name(symphony_id) if symphony_id else ""
    filename = f"{folder_name}_{id_part + '_' if id_part else ''}{today_str}.json"
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

    try:
        local_path = resolve_local_write_path(config.get("local_path", ""))
    except LocalPathError as exc:
        logger.warning("Symphony export skipped: %s", exc)
        return

    score = client.get_symphony_score(symphony_id)
    if not score:
        return

    _save_local(local_path, symphony_name, score, symphony_id=symphony_id)


def export_all_symphonies(db: Session, client: ComposerClient, account_id: str):
    """Export latest version of all symphonies if they have changed since last export.

    Called as a sync step in full_backfill() and incremental_update().
    """
    config = load_symphony_export_config()
    if not config:
        return

    try:
        local_path = resolve_local_write_path(config.get("local_path", ""))
    except LocalPathError as exc:
        logger.warning("Symphony export skipped: %s", exc)
        return

    # Export should include invested symphonies *and* the user's drafts.
    # Drafts are user-scoped; during sync we run once per account, so draft export
    # state must be shared across all sub-accounts under the same credential.
    invested_targets: Dict[str, str] = {}
    draft_targets: Dict[str, str] = {}

    try:
        symphonies = client.get_symphony_stats(account_id) or []
        for s in symphonies:
            sym_id = s.get("id", "")
            sym_name = s.get("name", "Unknown")
            if sym_id and sym_id not in invested_targets:
                invested_targets[sym_id] = sym_name
    except Exception as e:
        logger.warning("Failed to fetch symphony stats for export (%s): %s", account_id, e)

    try:
        drafts = client.get_drafts() or []
        for s in drafts:
            sym_id = s.get("symphony_id", s.get("id", s.get("symphony_sid", "")))
            sym_name = s.get("name", "Unknown")
            if sym_id and sym_id not in invested_targets and sym_id not in draft_targets:
                draft_targets[sym_id] = sym_name
    except Exception as e:
        logger.warning("Failed to fetch drafts for export (%s): %s", account_id, e)

    # Drafts are credential-scoped, not account-scoped.
    drafts_state_account_id = account_id
    try:
        acct = db.query(Account).filter_by(id=account_id).first()
        if acct and acct.credential_name:
            drafts_state_account_id = f"{_DRAFTS_STATE_ACCOUNT_PREFIX}{acct.credential_name}"
    except Exception as exc:
        logger.warning("Failed to resolve credential scope for drafts export (%s): %s", account_id, exc)

    exported = 0

    def _export_one(sym_id: str, sym_name: str, *, state_account_id: str) -> bool:
        nonlocal exported
        sym_name = sym_name or "Unknown"

        # Use versions endpoint for lightweight change detection
        try:
            versions = client.get_symphony_versions(sym_id)
        except Exception as e:
            logger.warning("Failed to fetch versions for symphony %s: %s", sym_id, e)
            return False

        latest_ts = ""
        if versions:
            latest = versions[0] if isinstance(versions, list) else versions
            if isinstance(latest, dict):
                latest_ts = latest.get("created_at") or latest.get("updated_at") or ""

        # Check if we already exported this version (timestamp-based)
        state_key_ts = f"symphony_export:{sym_id}"
        if latest_ts:
            last_exported = _get_sync_state(db, state_account_id, state_key_ts)
            if last_exported and last_exported >= latest_ts:
                return False

        # Fetch full structure via /score
        score = client.get_symphony_score(sym_id)
        if not score:
            return False

        # Drafts (and occasionally invested symphonies) can return an empty versions list;
        # use a content hash fallback so we still export once and only re-export on actual
        # structure changes.
        state_key_hash = f"symphony_export_hash:{sym_id}"
        if not latest_ts:
            canonical = json.dumps(score, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            score_hash = hashlib.sha256(canonical).hexdigest()
            last_hash = _get_sync_state(db, state_account_id, state_key_hash)
            if last_hash and last_hash == score_hash:
                return False

            _save_local(local_path, sym_name, score, symphony_id=sym_id)
            _set_sync_state(db, state_account_id, state_key_hash, score_hash)
        else:
            _save_local(local_path, sym_name, score, symphony_id=sym_id)

            if latest_ts:
                _set_sync_state(db, state_account_id, state_key_ts, latest_ts)

        exported += 1
        time.sleep(0.3)  # gentle rate limit between version fetches
        return True

    for sym_id, sym_name in invested_targets.items():
        _export_one(sym_id, sym_name, state_account_id=account_id)

    for sym_id, sym_name in draft_targets.items():
        _export_one(sym_id, sym_name, state_account_id=drafts_state_account_id)

    logger.info(
        "Symphony export for %s: %d exported, %d total",
        account_id,
        exported,
        len(invested_targets) + len(draft_targets),
    )

