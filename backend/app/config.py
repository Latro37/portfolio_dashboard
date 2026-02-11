"""Application configuration loaded from environment variables and accounts.json."""

import json
import logging
import os
from typing import List, Optional

from pydantic import BaseModel
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

# Project root: two levels up from this file (backend/app/config.py -> project root)
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


class AccountCredentials(BaseModel):
    """One Composer account's credentials from accounts.json."""
    name: str
    api_key_id: str
    api_secret: str

    def __repr__(self) -> str:
        """Prevent credentials from appearing in logs/tracebacks."""
        return f"AccountCredentials(name={self.name!r}, api_key_id='***', api_secret='***')"

    def __str__(self) -> str:
        return self.__repr__()


class Settings(BaseSettings):
    # Composer API base URL
    composer_api_base_url: str = "https://api.composer.trade"

    # Database
    database_url: str = "sqlite:///data/portfolio.db"

    # Market / Analytics
    benchmark_ticker: str = "SPY"
    risk_free_rate: float = 0.05  # annualized

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


def get_settings() -> Settings:
    """Load settings, searching for .env in project root."""
    env_path = os.path.join(_PROJECT_ROOT, ".env")
    if os.path.exists(env_path):
        return Settings(_env_file=env_path)
    return Settings()


# Module-level cache for parsed accounts.json data
_accounts_json_cache: Optional[dict] = None


def _load_accounts_json() -> dict:
    """Load and cache the raw accounts.json content.

    Supports two formats:
    - Legacy array: [{"name": ..., "api_key_id": ..., "api_secret": ...}, ...]
    - New object:   {"finnhub_api_key": "...", "accounts": [...]}

    Returns a normalized dict with keys 'accounts' (list) and optionally 'finnhub_api_key'.
    """
    global _accounts_json_cache
    if _accounts_json_cache is not None:
        return _accounts_json_cache

    accounts_path = os.path.join(_PROJECT_ROOT, "accounts.json")
    if not os.path.exists(accounts_path):
        raise FileNotFoundError(
            f"accounts.json not found at {accounts_path}. "
            "Copy accounts.json.example to accounts.json and fill in your Composer API credentials."
        )
    try:
        with open(accounts_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(f"accounts.json is not valid JSON (line {e.lineno}). Check syntax.") from None

    if isinstance(raw, list):
        # Legacy array format
        _accounts_json_cache = {"accounts": raw}
    elif isinstance(raw, dict) and "accounts" in raw:
        # New object format
        _accounts_json_cache = raw
    else:
        raise ValueError(
            "accounts.json must be a JSON array of account objects or an object with an 'accounts' key."
        )
    return _accounts_json_cache


def load_accounts() -> List[AccountCredentials]:
    """Load Composer account credentials from accounts.json.

    Supports both the legacy array format and the new object format.
    Raises FileNotFoundError with a helpful message if the file is missing.
    """
    data = _load_accounts_json()
    account_list = data["accounts"]
    if not isinstance(account_list, list) or len(account_list) == 0:
        raise ValueError("accounts.json must contain a non-empty 'accounts' array.")
    try:
        accounts = [AccountCredentials(**entry) for entry in account_list]
    except Exception:
        raise ValueError(
            "accounts.json entries must have 'name', 'api_key_id', and 'api_secret' fields."
        ) from None
    logger.info("Loaded %d Composer account(s) from accounts.json", len(accounts))
    return accounts


def load_finnhub_key() -> Optional[str]:
    """Return the Finnhub API key from accounts.json, or None if not configured."""
    try:
        data = _load_accounts_json()
        key = data.get("finnhub_api_key", "")
        return key if key else None
    except Exception:
        return None


def _accounts_json_path() -> str:
    return os.path.join(_PROJECT_ROOT, "accounts.json")


def _save_accounts_json(data: dict):
    """Write updated config back to accounts.json and invalidate cache."""
    global _accounts_json_cache
    path = _accounts_json_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    _accounts_json_cache = data


def load_symphony_export_config() -> Optional[dict]:
    """Return the symphony_export config block, or None if not configured.

    Always re-reads accounts.json from disk so that external edits
    (e.g. adding google_drive credentials) are picked up without restart.
    Returns dict with keys: local_path (str), google_drive (dict|None).
    """
    global _accounts_json_cache
    try:
        _accounts_json_cache = None  # invalidate cache
        data = _load_accounts_json()
        cfg = data.get("symphony_export")
        if not cfg or not isinstance(cfg, dict):
            return None
        return cfg
    except Exception:
        return None


def save_symphony_export_path(local_path: str):
    """Persist the symphony export local_path into accounts.json."""
    data = _load_accounts_json()
    if "symphony_export" not in data or not isinstance(data.get("symphony_export"), dict):
        data["symphony_export"] = {}
    data["symphony_export"]["local_path"] = local_path
    _save_accounts_json(data)


def load_screenshot_config() -> Optional[dict]:
    """Return the screenshot config block, or None if not configured.

    Always re-reads accounts.json from disk.
    """
    global _accounts_json_cache
    try:
        _accounts_json_cache = None
        data = _load_accounts_json()
        cfg = data.get("screenshot")
        if not cfg or not isinstance(cfg, dict):
            return None
        return cfg
    except Exception:
        return None


def save_screenshot_config(config: dict):
    """Persist the screenshot config block into accounts.json."""
    global _accounts_json_cache
    _accounts_json_cache = None
    data = _load_accounts_json()
    data["screenshot"] = config
    _save_accounts_json(data)
