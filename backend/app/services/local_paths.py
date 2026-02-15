"""Safe local filesystem path resolution for export/screenshot writes."""

from __future__ import annotations

import os

from app.config import get_settings


class LocalPathError(ValueError):
    """Raised when a configured local path fails safety constraints."""


def _project_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def get_local_write_base_dir() -> str:
    """Return the normalized approved write root for local file outputs."""
    configured = get_settings().local_write_base_dir.strip() or "data/local_storage"
    if os.path.isabs(configured):
        base = configured
    else:
        base = os.path.join(_project_root(), configured)
    base_abs = os.path.realpath(os.path.abspath(base))
    os.makedirs(base_abs, exist_ok=True)
    return base_abs


def resolve_local_write_path(local_path: str) -> str:
    """Normalize and validate a write destination under the approved base directory."""
    raw = (local_path or "").strip()
    if not raw:
        raise LocalPathError("local_path is required")
    if raw.startswith("\\\\"):
        raise LocalPathError("UNC/network paths are not allowed")

    base = get_local_write_base_dir()
    if os.path.isabs(raw):
        candidate = raw
    else:
        candidate = os.path.join(base, raw)

    normalized = os.path.realpath(os.path.abspath(candidate))
    if os.path.commonpath([base, normalized]) != base:
        raise LocalPathError(f"local_path must stay under approved base directory: {base}")
    return normalized
