"""Safe local filesystem path resolution for export/screenshot writes."""

from __future__ import annotations

import os

from app.config import get_settings


class LocalPathError(ValueError):
    """Raised when a configured local path fails safety constraints."""


def _project_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def _normalized(path: str) -> str:
    return os.path.realpath(os.path.abspath(path))


def _configured_base_dir() -> str:
    configured = get_settings().local_write_base_dir.strip() or "data/local_storage"
    if os.path.isabs(configured):
        base = configured
    else:
        base = os.path.join(_project_root(), configured)
    return _normalized(base)


def get_local_write_base_dir() -> str:
    """Return the default base directory used for relative file output paths."""
    base = _configured_base_dir()
    os.makedirs(base, exist_ok=True)
    return base


def resolve_local_write_path(local_path: str) -> str:
    """Normalize a write destination.

    Relative paths resolve under settings.local_write_base_dir.
    Absolute paths are accepted as provided (including parent segments).
    """
    raw = (local_path or "").strip()
    if not raw:
        raise LocalPathError("local_path is required")

    if os.path.isabs(raw):
        return _normalized(raw)

    base = get_local_write_base_dir()
    return _normalized(os.path.join(base, raw))
