"""Portfolio admin/service operations used by HTTP routers."""

from __future__ import annotations

import logging
import os
import re
import time
from contextlib import contextmanager
from datetime import date as date_cls
from threading import Lock
from typing import Callable, Generator, Optional

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.config import (
    is_test_mode,
    load_finnhub_key,
    load_polygon_key,
    load_screenshot_config,
    load_symphony_export_config,
    save_screenshot_config,
    save_symphony_export_path,
)
from app.models import Account, CashFlow
from app.schemas import ManualCashFlowRequest
from app.services.sync import (
    full_backfill,
    get_sync_state,
    incremental_update,
)

logger = logging.getLogger(__name__)

_MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024  # 10 MB
_sync_state_lock = Lock()
_syncing = False


@contextmanager
def _sync_guard() -> Generator[bool, None, None]:
    """Acquire a non-blocking in-memory sync guard."""
    global _syncing
    acquired = _sync_state_lock.acquire(blocking=False)
    if not acquired:
        yield False
        return
    _syncing = True
    try:
        yield True
    finally:
        _syncing = False
        _sync_state_lock.release()


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
    return {
        "status": "syncing" if is_syncing() else "idle",
        "last_sync_date": state.get("last_sync_date"),
        "initial_backfill_done": state.get("initial_backfill_done") == "true",
        "message": "",
    }


def trigger_sync_data(
    db: Session,
    *,
    account_id: Optional[str],
    resolve_account_ids_fn: Callable[[Session, Optional[str]], list[str]],
    get_client_for_account_fn: Callable[[Session, str], object],
) -> dict:
    """Trigger an incremental/full sync for selected visible accounts."""
    with _sync_guard() as acquired:
        if not acquired:
            return {"status": "already_syncing"}

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

            for aid in sync_ids:
                client = get_client_for_account_fn(db, aid)
                state = get_sync_state(db, aid)
                if state.get("initial_backfill_done") == "true":
                    incremental_update(db, client, aid)
                else:
                    full_backfill(db, client, aid)
                if len(sync_ids) > 1:
                    time.sleep(1)

            return {"status": "complete", "synced_accounts": len(sync_ids)}
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Sync failed: %s", exc, exc_info=True)
            raise HTTPException(500, f"Sync failed: {exc}")


def get_app_config_data() -> dict:
    export_cfg = load_symphony_export_config()
    export_status = None
    if export_cfg:
        export_status = {"local_path": export_cfg.get("local_path", "")}

    screenshot_cfg = load_screenshot_config()
    return {
        "finnhub_api_key": None,
        "finnhub_configured": load_finnhub_key() is not None,
        "polygon_configured": load_polygon_key() is not None,
        "symphony_export": export_status,
        "screenshot": screenshot_cfg,
        "test_mode": is_test_mode(),
    }


def save_symphony_export_config_data(local_path: str) -> dict:
    normalized = local_path.strip()
    if not normalized:
        raise HTTPException(400, "local_path is required")
    save_symphony_export_path(normalized)
    return {"ok": True, "local_path": normalized}


def save_screenshot_config_data(config: dict) -> dict:
    local_path = (config.get("local_path") or "").strip()
    if not local_path:
        raise HTTPException(400, "local_path is required")
    save_screenshot_config(config)
    return {"ok": True}


async def upload_screenshot_data(request: Request) -> dict:
    cfg = load_screenshot_config()
    if not cfg:
        raise HTTPException(400, "Screenshot not configured")

    local_path = cfg.get("local_path", "")
    if not local_path:
        raise HTTPException(400, "Screenshot save folder not configured")

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
