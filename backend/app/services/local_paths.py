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


def _allow_home_fallback() -> bool:
    # If an explicit base override is provided, enforce only that root.
    if os.environ.get("PD_LOCAL_WRITE_BASE_DIR", "").strip():
        return False
    configured = get_settings().local_write_base_dir.strip() or "data/local_storage"
    return configured == "data/local_storage"


def _allowed_write_roots() -> list[str]:
    primary = _configured_base_dir()
    roots = [primary]

    # Compatibility mode: older configs often used absolute paths in user space.
    if _allow_home_fallback():
        home = _normalized(os.path.expanduser("~"))
        if home and os.path.normcase(home) not in {os.path.normcase(root) for root in roots}:
            roots.append(home)
    return roots


def get_local_write_base_dir() -> str:
    """Return the normalized approved write root for local file outputs."""
    base = _configured_base_dir()
    os.makedirs(base, exist_ok=True)
    return base


def resolve_local_write_path(local_path: str) -> str:
    """Normalize and validate a write destination under the approved base directory."""
    raw = (local_path or "").strip()
    if not raw:
        raise LocalPathError("local_path is required")
    if raw.startswith("\\\\"):
        raise LocalPathError("UNC/network paths are not allowed")

    bases = _allowed_write_roots()
    primary_base = bases[0]
    os.makedirs(primary_base, exist_ok=True)
    is_absolute = os.path.isabs(raw)
    if is_absolute:
        candidate = raw
    else:
        candidate = os.path.join(primary_base, raw)

    normalized = _normalized(candidate)
    candidate_bases = bases if is_absolute else [primary_base]
    for base in candidate_bases:
        try:
            if os.path.commonpath([base, normalized]) == base:
                return normalized
        except ValueError:
            # Different Windows drive roots always fail base containment.
            continue

    allowed = ", ".join(bases)
    raise LocalPathError(f"local_path must stay under approved base directory: {allowed}")
