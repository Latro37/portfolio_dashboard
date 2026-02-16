"""Helpers for manual cash-flow tagging and display normalization."""

from __future__ import annotations

from app.models import CashFlow

MANUAL_DESCRIPTION_PREFIX = "[pd-manual]"
_LEGACY_MANUAL_DESCRIPTION = "manual entry"
_DEFAULT_MANUAL_DESCRIPTION = "Manual entry"


def normalize_manual_description(raw_description: str | None) -> str:
    """Return a user-facing description without the internal manual prefix."""
    text = (raw_description or "").strip()
    if not text:
        return ""

    lowered = text.lower()
    prefix_lower = MANUAL_DESCRIPTION_PREFIX.lower()
    if lowered.startswith(prefix_lower):
        stripped = text[len(MANUAL_DESCRIPTION_PREFIX):].strip()
        return stripped or _DEFAULT_MANUAL_DESCRIPTION
    return text


def encode_manual_description(user_description: str | None) -> str:
    """Persist manual entries with an internal prefix for safe identification."""
    normalized = normalize_manual_description(user_description)
    if not normalized:
        normalized = _DEFAULT_MANUAL_DESCRIPTION
    return f"{MANUAL_DESCRIPTION_PREFIX} {normalized}"


def is_manual_cash_flow(row: CashFlow) -> bool:
    """Identify rows created through the manual cash-flow path."""
    if row.type not in ("deposit", "withdrawal"):
        return False

    text = (row.description or "").strip()
    lowered = text.lower()
    if lowered.startswith(MANUAL_DESCRIPTION_PREFIX.lower()):
        return True

    # Backward compatibility for older rows created before prefix tagging.
    return lowered == _LEGACY_MANUAL_DESCRIPTION or lowered.startswith("manual ")
