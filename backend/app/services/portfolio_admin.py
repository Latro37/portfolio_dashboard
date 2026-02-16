"""Portfolio admin/service operations used by HTTP routers."""

from __future__ import annotations

import logging
import os
import re
import time
from datetime import date as date_cls
from threading import Lock, Thread
from typing import Callable, Optional

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.config import (
    get_first_start_run_id,
    is_first_start_test_mode,
    is_test_mode,
    load_finnhub_key,
    load_polygon_key,
    load_screenshot_config,
    load_symphony_export_config,
    save_symphony_export_config,
    validate_composer_config,
    save_screenshot_config,
)
from app.models import Account, CashFlow
from app.schemas import ManualCashFlowRequest
from app.security import get_local_auth_token
from app.services.local_paths import LocalPathError, resolve_local_write_path
from app.services.sync import (
    full_backfill_core,
    finish_initial_backfill_activity,
    get_sync_state,
    incremental_update,
)
from app.services.symphony_export_jobs import (
    cancel_symphony_export_job,
    get_symphony_export_job_status,
    start_symphony_export_job,
)

logger = logging.getLogger(__name__)

_MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024  # 10 MB
_sync_state_lock = Lock()
_syncing = False
_sync_message = ""
_sync_error: Optional[str] = None


def _start_symphony_export_job_if_enabled(account_ids: list[str]) -> None:
    if not account_ids:
        return

    export_cfg = load_symphony_export_config() or {}
    if not bool(export_cfg.get("enabled", True)):
        logger.info("Symphony export disabled by config; skipping background export job")
        return

    try:
        start_symphony_export_job(account_ids)
    except Exception as exc:
        logger.warning("Failed to start symphony export job: %s", exc)


def is_syncing() -> bool:
    return _syncing


def add_manual_cash_flow_data(
    db: Session,
    body: ManualCashFlowRequest,
    *,
    resolve_account_ids_fn: Callable[[Session, Optional[str]], list[str]],
    get_client_for_account_fn: Callable[[Session, str], object],
) -> dict:
    """Insert a manual cash flow and recompute derived portfolio metrics."""
    if body.account_id == "all" or body.account_id.startswith("all:"):
        raise HTTPException(400, "account_id must be a specific sub-account UUID")

    # Validate account visibility and existence.
    resolve_account_ids_fn(db, body.account_id)

    cf_type = body.type if body.type in ("deposit", "withdrawal") else "deposit"
    amount = abs(body.amount) if cf_type == "deposit" else -abs(body.amount)

    db.add(
        CashFlow(
            account_id=body.account_id,
            date=body.date,
            type=cf_type,
            amount=amount,
            description=body.description or "Manual entry",
        )
    )
    db.commit()

    # Recompute account-level portfolio history/metrics after mutation.
    try:
        client = get_client_for_account_fn(db, body.account_id)
        from app.services.sync import _recompute_metrics, _sync_portfolio_history

        _sync_portfolio_history(db, client, body.account_id)
        _recompute_metrics(db, body.account_id)
    except Exception as exc:
        logger.warning("Post-manual-entry recompute failed: %s", exc)

    return {"status": "ok", "date": str(body.date), "type": cf_type, "amount": amount}


def get_sync_status_data(db: Session, account_id: str) -> dict:
    state = get_sync_state(db, account_id)
    status = "syncing" if is_syncing() else "idle"
    message = ""
    if status == "syncing":
        message = _sync_message
    elif _sync_error:
        status = "error"
        message = _sync_error
    return {
        "status": status,
        "last_sync_date": state.get("last_sync_date"),
        "initial_backfill_done": state.get("initial_backfill_done") == "true",
        "message": message or "",
    }

def get_symphony_export_job_status_data() -> dict:
    return get_symphony_export_job_status()


def cancel_symphony_export_job_data() -> dict:
    return {"ok": cancel_symphony_export_job()}


def trigger_sync_data(
    db: Session,
    *,
    account_id: Optional[str],
    resolve_account_ids_fn: Callable[[Session, Optional[str]], list[str]],
    get_client_for_account_fn: Callable[[Session, str], object],
) -> dict:
    """Trigger an incremental/full sync for selected visible accounts."""
    global _syncing, _sync_message, _sync_error

    with _sync_state_lock:
        if _syncing:
            return {"status": "already_syncing"}
        _syncing = True
        _sync_message = "Starting sync..."
        _sync_error = None

    handed_off = False
    try:
        selected_account = account_id if account_id else "all"
        ids = resolve_account_ids_fn(db, selected_account)

        # Skip synthetic test accounts (no real Composer credentials).
        test_ids = {a.id for a in db.query(Account).filter_by(credential_name="__TEST__").all()}
        sync_ids = [aid for aid in ids if aid not in test_ids]
        if not sync_ids:
            return {
                "status": "skipped",
                "synced_accounts": 0,
                "reason": "No sync-eligible accounts",
            }

        deferred_activity_ids: list[str] = []

        for aid in sync_ids:
            client = get_client_for_account_fn(db, aid)
            state = get_sync_state(db, aid)

            if state.get("initial_backfill_done") == "true":
                with _sync_state_lock:
                    _sync_message = f"Syncing incremental updates for {aid}..."
                incremental_update(db, client, aid)
            else:
                # First sync: core backfill now, heavy activity reports in background.
                if state.get("initial_backfill_core_done") == "true":
                    deferred_activity_ids.append(aid)
                else:
                    with _sync_state_lock:
                        _sync_message = f"Syncing first-run core data for {aid}..."
                    full_backfill_core(db, client, aid)
                    deferred_activity_ids.append(aid)

            if len(sync_ids) > 1:
                time.sleep(1)

        if deferred_activity_ids:
            handed_off = True
            # Prioritize first-run transactions + non-trade activity before draft export.
            _start_background_first_sync(deferred_activity_ids, export_account_ids=sync_ids)
            return {"status": "complete", "synced_accounts": len(sync_ids)}

        _start_symphony_export_job_if_enabled(sync_ids)
        return {"status": "complete", "synced_accounts": len(sync_ids)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Sync failed: %s", exc, exc_info=True)
        with _sync_state_lock:
            _sync_error = f"Sync failed: {exc}"
        raise HTTPException(500, f"Sync failed: {exc}")
    finally:
        if not handed_off:
            with _sync_state_lock:
                _syncing = False
                _sync_message = ""


def _start_background_first_sync(account_ids: list[str], *, export_account_ids: list[str]) -> None:
    """Spawn background continuation for the first sync (transactions + cash flows)."""

    thread = Thread(
        target=_run_background_first_sync,
        name="first-sync-activity-backfill",
        daemon=True,
        args=(list(account_ids), list(export_account_ids)),
    )
    thread.start()


def _run_background_first_sync(account_ids: list[str], export_account_ids: list[str]) -> None:
    global _syncing, _sync_message, _sync_error

    # Import here to avoid router import cycles.
    from app.services.account_clients import get_client_for_account
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        for aid in account_ids:
            with _sync_state_lock:
                _sync_message = f"Background: syncing transactions/cash flows for {aid}..."
            client = get_client_for_account(db, aid)
            finish_initial_backfill_activity(db, client, aid)
            time.sleep(1)

        # Once first-run activity is complete, symphony export can run in the background.
        _start_symphony_export_job_if_enabled(export_account_ids)

        with _sync_state_lock:
            _sync_message = ""
            _sync_error = None
    except Exception as exc:
        logger.error("Background first-sync continuation failed: %s", exc, exc_info=True)
        with _sync_state_lock:
            _sync_error = f"Background sync failed: {exc}"
            _sync_message = ""
    finally:
        with _sync_state_lock:
            _syncing = False
        db.close()


def get_app_config_data() -> dict:
    composer_ok, composer_err = validate_composer_config()
    export_cfg = load_symphony_export_config()
    export_status = None
    if export_cfg:
        export_status = {
            "enabled": bool(export_cfg.get("enabled", True)),
            "local_path": export_cfg.get("local_path", ""),
        }

    screenshot_cfg = load_screenshot_config()
    first_start_mode = is_first_start_test_mode()
    return {
        "finnhub_api_key": None,
        "finnhub_configured": load_finnhub_key() is not None,
        "polygon_configured": load_polygon_key() is not None,
        "local_auth_token": get_local_auth_token(),
        "symphony_export": export_status,
        "screenshot": screenshot_cfg,
        "test_mode": is_test_mode(),
        "first_start_test_mode": first_start_mode,
        "first_start_run_id": get_first_start_run_id() if first_start_mode else None,
        "composer_config_ok": composer_ok,
        "composer_config_error": composer_err,
    }


def save_symphony_export_config_data(local_path: str, enabled: bool) -> dict:
    current = load_symphony_export_config() or {}
    candidate = (local_path or "").strip() or str(current.get("local_path") or "").strip()
    try:
        normalized = resolve_local_write_path(candidate)
    except LocalPathError as exc:
        raise HTTPException(400, str(exc))
    save_symphony_export_config(local_path=normalized, enabled=bool(enabled))
    return {"ok": True, "local_path": normalized, "enabled": bool(enabled)}


def save_screenshot_config_data(config: dict) -> dict:
    try:
        local_path = resolve_local_write_path(config.get("local_path") or "")
    except LocalPathError as exc:
        raise HTTPException(400, str(exc))
    config["local_path"] = local_path
    save_screenshot_config(config)
    return {"ok": True}


async def upload_screenshot_data(request: Request) -> dict:
    cfg = load_screenshot_config()
    if not cfg:
        raise HTTPException(400, "Screenshot not configured")

    try:
        local_path = resolve_local_write_path(cfg.get("local_path", ""))
    except LocalPathError as exc:
        raise HTTPException(400, str(exc))

    form = await request.form()
    file = form.get("file")
    date_str = form.get("date", "")
    if not file:
        raise HTTPException(400, "No file uploaded")

    if not date_str:
        date_str = date_cls.today().isoformat()

    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        raise HTTPException(400, "Invalid date format, expected YYYY-MM-DD")

    os.makedirs(local_path, exist_ok=True)
    filename = f"Snapshot_{date_str}.png"
    filepath = os.path.join(local_path, filename)

    contents = await file.read()
    if len(contents) > _MAX_SCREENSHOT_BYTES:
        raise HTTPException(413, f"File too large (max {_MAX_SCREENSHOT_BYTES // 1024 // 1024} MB)")

    with open(filepath, "wb") as handle:
        handle.write(contents)

    logger.info("Screenshot saved to %s (%d bytes)", filepath, len(contents))
    return {"ok": True, "path": filepath}
