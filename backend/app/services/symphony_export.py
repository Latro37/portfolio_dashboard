"""Symphony structure export: save latest version JSON locally."""

import hashlib
import json
import logging
import os
import re
import time
from datetime import date
from typing import Callable, Dict, List, Optional

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


def _extract_latest_ts_hint(payload: dict) -> str:
    """Best-effort edit timestamp hint from symphony metadata payloads.

    This lets us skip per-symphony version API calls when metadata already
    carries a reliable timestamp.
    """
    if not isinstance(payload, dict):
        return ""

    for key in (
        "updated_at",
        "created_at",
        "updatedAt",
        "createdAt",
        "last_updated_at",
        "lastUpdatedAt",
        "modified_at",
        "modifiedAt",
    ):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    latest_version = payload.get("latest_version") or payload.get("latestVersion")
    if isinstance(latest_version, dict):
        for key in ("updated_at", "created_at", "updatedAt", "createdAt"):
            value = latest_version.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    return ""


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
    return export_all_symphonies_with_options(db=db, client=client, account_id=account_id)


def export_all_symphonies_with_options(
    db: Session,
    client: ComposerClient,
    account_id: str,
    *,
    include_drafts: bool = True,
    progress_cb: Optional[Callable[[dict], None]] = None,
    cancelled_cb: Optional[Callable[[], bool]] = None,
):
    """Export latest version of all symphonies if they have changed since last export.

    - Invested symphonies are always included.
    - Drafts are credential-scoped; callers syncing multiple sub-accounts should
      invoke this with include_drafts=True for exactly one sub-account per credential.
    - Optional progress_cb receives small dict events and must never raise.
    """
    config = load_symphony_export_config()
    if not config:
        return
    if not bool(config.get("enabled", True)):
        logger.info("Symphony export disabled by config; skipping account %s", account_id)
        return {"exported": 0, "processed": 0, "total": 0, "cancelled": False}

    try:
        local_path = resolve_local_write_path(config.get("local_path", ""))
    except LocalPathError as exc:
        logger.warning("Symphony export skipped: %s", exc)
        return

    export_drafts = bool(include_drafts)
    # Export includes invested symphonies.
    invested_targets: Dict[str, Dict[str, str]] = {}
    draft_targets: Dict[str, Dict[str, str]] = {}

    try:
        symphonies = client.get_symphony_stats(account_id) or []
        for s in symphonies:
            sym_id = s.get("id", "")
            sym_name = s.get("name", "Unknown")
            if sym_id and sym_id not in invested_targets:
                invested_targets[sym_id] = {
                    "name": sym_name,
                    "latest_ts_hint": _extract_latest_ts_hint(s),
                }
    except Exception as e:
        logger.warning("Failed to fetch symphony stats for export (%s): %s", account_id, e)

    # Drafts are credential-scoped, not account-scoped.
    drafts_state_account_id = account_id
    if export_drafts:
        try:
            drafts = client.get_drafts() or []
            for s in drafts:
                sym_id = s.get("symphony_id", s.get("id", s.get("symphony_sid", "")))
                sym_name = s.get("name", "Unknown")
                if sym_id and sym_id not in invested_targets and sym_id not in draft_targets:
                    draft_targets[sym_id] = {
                        "name": sym_name,
                        "latest_ts_hint": _extract_latest_ts_hint(s),
                    }
        except Exception as e:
            logger.warning("Failed to fetch drafts for export (%s): %s", account_id, e)

        try:
            acct = db.query(Account).filter_by(id=account_id).first()
            if acct and acct.credential_name:
                drafts_state_account_id = f"{_DRAFTS_STATE_ACCOUNT_PREFIX}{acct.credential_name}"
        except Exception as exc:
            logger.warning("Failed to resolve credential scope for drafts export (%s): %s", account_id, exc)

    exported = 0
    processed = 0

    total_targets = len(invested_targets) + (len(draft_targets) if export_drafts else 0)
    def _is_cancelled() -> bool:
        if not cancelled_cb:
            return False
        try:
            return bool(cancelled_cb())
        except Exception:
            return False

    if progress_cb:
        try:
            progress_cb(
                {
                    "event": "targets",
                    "account_id": account_id,
                    "total": total_targets,
                    "invested_total": len(invested_targets),
                    "draft_total": len(draft_targets) if export_drafts else 0,
                }
            )
        except Exception:
            pass

    def _mark_processed(sym_id: str, *, did_export: bool) -> None:
        nonlocal exported, processed
        if did_export:
            exported += 1
        processed += 1
        if progress_cb:
            try:
                progress_cb(
                    {
                        "event": "processed",
                        "account_id": account_id,
                        "symphony_id": sym_id,
                        "exported": did_export,
                        "processed": processed,
                        "exported_count": exported,
                        "total": total_targets,
                    }
                )
            except Exception:
                pass

    def _export_one(
        sym_id: str,
        sym_name: str,
        *,
        state_account_id: str,
        latest_ts_hint: str = "",
    ) -> bool:
        nonlocal exported, processed
        if _is_cancelled():
            return False
        sym_name = sym_name or "Unknown"
        state_key_ts = f"symphony_export:{sym_id}"
        last_exported = _get_sync_state(db, state_account_id, state_key_ts)

        # Fast path: when metadata already exposes a timestamp, avoid a separate
        # versions API request for unchanged symphonies.
        latest_ts = (latest_ts_hint or "").strip()
        if latest_ts and last_exported and last_exported >= latest_ts:
            _mark_processed(sym_id, did_export=False)
            return False

        # If metadata lacks a usable timestamp hint, use versions API for
        # change detection and timestamp persistence.
        if not latest_ts:
            try:
                versions = client.get_symphony_versions(sym_id)
            except Exception as e:
                logger.warning("Failed to fetch versions for symphony %s: %s", sym_id, e)
                _mark_processed(sym_id, did_export=False)
                return False

            if versions:
                latest = versions[0] if isinstance(versions, list) else versions
                if isinstance(latest, dict):
                    latest_ts = (
                        latest.get("created_at")
                        or latest.get("updated_at")
                        or ""
                    )

            if latest_ts and last_exported and last_exported >= latest_ts:
                _mark_processed(sym_id, did_export=False)
                return False

        # Fetch full structure via /score
        if _is_cancelled():
            return False
        score = client.get_symphony_score(sym_id)
        if not score:
            _mark_processed(sym_id, did_export=False)
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
                _mark_processed(sym_id, did_export=False)
                return False

            _save_local(local_path, sym_name, score, symphony_id=sym_id)
            _set_sync_state(db, state_account_id, state_key_hash, score_hash)
        else:
            _save_local(local_path, sym_name, score, symphony_id=sym_id)
            _set_sync_state(db, state_account_id, state_key_ts, latest_ts)

        _mark_processed(sym_id, did_export=True)
        time.sleep(0.3)  # gentle rate limit between version fetches
        return True

    for sym_id, target in invested_targets.items():
        if _is_cancelled():
            break
        _export_one(
            sym_id,
            target.get("name", "Unknown"),
            state_account_id=account_id,
            latest_ts_hint=target.get("latest_ts_hint", ""),
        )

    if export_drafts:
        for sym_id, target in draft_targets.items():
            if _is_cancelled():
                break
            _export_one(
                sym_id,
                target.get("name", "Unknown"),
                state_account_id=drafts_state_account_id,
                latest_ts_hint=target.get("latest_ts_hint", ""),
            )

    logger.info(
        "Symphony export for %s: %d exported, %d total",
        account_id,
        exported,
        total_targets,
    )
    return {
        "exported": exported,
        "processed": processed,
        "total": total_targets,
        "cancelled": _is_cancelled(),
    }

