"""Background symphony export job manager.

Exports symphony structures (invested + optional drafts) to local JSON files without
blocking sync HTTP requests.

This module uses in-memory state (single-process) and is intended for local-first use.
"""

from __future__ import annotations

import logging
import threading
import uuid
from collections import defaultdict
from typing import Dict, List, Optional

from app.database import SessionLocal
from app.models import Account
from app.services.account_clients import get_client_for_account
from app.services.symphony_export import export_all_symphonies_with_options

logger = logging.getLogger(__name__)

_job_lock = threading.Lock()
_job_cancel_events: Dict[str, threading.Event] = {}
_job_state: dict = {
    "status": "idle",  # idle|running|cancelling|complete|cancelled|error
    "job_id": None,
    "exported": 0,
    "processed": 0,
    "total": None,
    "message": "",
    "error": None,
}


def _set_state(**updates) -> None:
    with _job_lock:
        _job_state.update(updates)


def get_symphony_export_job_status() -> dict:
    with _job_lock:
        return dict(_job_state)


def _is_cancel_requested(job_id: str) -> bool:
    with _job_lock:
        event = _job_cancel_events.get(job_id)
        if not event:
            return False
        return event.is_set()


def cancel_symphony_export_job(job_id: Optional[str] = None) -> bool:
    """Request cancellation of the active background export job."""
    with _job_lock:
        active_status = str(_job_state.get("status") or "")
        active_job_id = str(_job_state.get("job_id") or "")
        if active_status not in {"running", "cancelling"} or not active_job_id:
            return False
        if job_id and active_job_id != str(job_id):
            return False
        event = _job_cancel_events.get(active_job_id)
        if not event:
            return False
        event.set()
        if active_status != "cancelling":
            _job_state["status"] = "cancelling"
            _job_state["message"] = "Stopping symphony export..."
        return True


def start_symphony_export_job(account_ids: List[str]) -> str:
    """Start a background export job if one is not already running.

    Returns the active job_id (existing or newly created).
    """
    account_ids = [aid for aid in (account_ids or []) if aid]
    with _job_lock:
        if _job_state.get("status") in {"running", "cancelling"} and _job_state.get("job_id"):
            return str(_job_state["job_id"])

        job_id = str(uuid.uuid4())
        _job_cancel_events.clear()
        _job_cancel_events[job_id] = threading.Event()
        _job_state.update(
            {
                "status": "running",
                "job_id": job_id,
                "exported": 0,
                "processed": 0,
                "total": None,
                "message": "Starting symphony export...",
                "error": None,
            }
        )

    thread = threading.Thread(
        target=_run_export_job,
        name=f"symphony-export-{job_id[:8]}",
        daemon=True,
        args=(job_id, account_ids),
    )
    thread.start()
    return job_id


def _run_export_job(job_id: str, account_ids: List[str]) -> None:
    db = SessionLocal()
    try:
        def _cancelled() -> bool:
            return _is_cancel_requested(job_id)

        # Resolve credential grouping to avoid exporting drafts repeatedly per sub-account.
        rows = db.query(Account).filter(Account.id.in_(account_ids)).all()
        cred_to_ids: Dict[str, List[str]] = defaultdict(list)
        for row in rows:
            cred_to_ids[row.credential_name].append(row.id)

        # Keep processing deterministic for logs and stable progress.
        for cred_name in sorted(cred_to_ids.keys()):
            if _cancelled():
                break
            ids = sorted(cred_to_ids[cred_name])
            if not ids:
                continue

            rep_id = ids[0]
            for aid in ids:
                if _cancelled():
                    break
                include_drafts = aid == rep_id
                _set_state(message=f"Exporting symphonies ({cred_name}) for {aid}...")

                client = get_client_for_account(db, aid)

                def _progress(evt: dict) -> None:
                    # evt contains exported_count/processed/total for the current account call.
                    # We aggregate across calls as best-effort; totals are approximate.
                    if str(get_symphony_export_job_status().get("job_id")) != job_id or _cancelled():
                        return
                    if evt.get("event") == "targets":
                        total = evt.get("total")
                        if isinstance(total, int):
                            with _job_lock:
                                existing_total = _job_state.get("total")
                                if existing_total is None:
                                    _job_state["total"] = 0
                                _job_state["total"] = int(_job_state["total"]) + int(total)
                        return

                    if evt.get("event") != "processed":
                        return

                    exported_delta = 1 if evt.get("exported") else 0
                    with _job_lock:
                        _job_state["processed"] = int(_job_state.get("processed") or 0) + 1
                        _job_state["exported"] = int(_job_state.get("exported") or 0) + exported_delta

                export_all_symphonies_with_options(
                    db=db,
                    client=client,
                    account_id=aid,
                    include_drafts=include_drafts,
                    progress_cb=_progress,
                    cancelled_cb=_cancelled,
                )

        if _cancelled():
            _set_state(status="cancelled", message="Symphony export cancelled")
        else:
            _set_state(status="complete", message="Symphony export complete")
    except Exception as exc:
        logger.error("Symphony export job failed: %s", exc, exc_info=True)
        _set_state(status="error", error=str(exc), message="Symphony export failed")
    finally:
        with _job_lock:
            _job_cancel_events.pop(job_id, None)
        db.close()
