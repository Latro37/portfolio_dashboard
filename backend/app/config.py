"""Application configuration loaded from config.json."""

import json
import logging
import os
from typing import List, Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Project root: two levels up from this file (backend/app/config.py -> project root)
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def is_test_mode() -> bool:
    """Return True when test mode env flag is enabled via PD_TEST_MODE=1."""
    return os.environ.get("PD_TEST_MODE", "").strip() == "1"


class AccountCredentials(BaseModel):
    """One Composer account's credentials from config.json."""
    name: str
    api_key_id: str
    api_secret: str

    def __repr__(self) -> str:
        """Prevent credentials from appearing in logs/tracebacks."""
        return f"AccountCredentials(name={self.name!r}, api_key_id='***', api_secret='***')"

    def __str__(self) -> str:
        return self.__repr__()


class Settings(BaseModel):
    # Composer API base URL
    composer_api_base_url: str = "https://api.composer.trade"

    # Database
    database_url: str = "sqlite:///data/portfolio.db"

    # Local security and filesystem controls
    local_auth_token: str = ""
    local_write_base_dir: str = "data/local_storage"

    # Market / Analytics
    benchmark_ticker: str = "SPY"
    risk_free_rate: float = 0.05  # annualized


def get_settings() -> Settings:
    """Load settings from config.json."""
    try:
        data = _load_config_json()
        overrides = data.get("settings", {})
    except Exception:
        overrides = {}

    values = {k: v for k, v in overrides.items() if k in Settings.model_fields}
    # Allow test/local runners to force an isolated DB without editing config.json.
    env_db_url = os.environ.get("PD_DATABASE_URL", "").strip()
    if env_db_url:
        values["database_url"] = env_db_url
    env_local_auth_token = os.environ.get("PD_LOCAL_AUTH_TOKEN", "").strip()
    if env_local_auth_token:
        values["local_auth_token"] = env_local_auth_token
    env_local_write_base_dir = os.environ.get("PD_LOCAL_WRITE_BASE_DIR", "").strip()
    if env_local_write_base_dir:
        values["local_write_base_dir"] = env_local_write_base_dir

    return Settings(**values)


# Module-level cache for parsed config.json data
_config_json_cache: Optional[dict] = None


def _load_config_json() -> dict:
    """Load and cache config.json.

    Returns a dict with keys 'accounts' (list) and optionally 'finnhub_api_key', 'settings', etc.
    """
    global _config_json_cache
    if _config_json_cache is not None:
        return _config_json_cache

    config_path = os.path.join(_PROJECT_ROOT, "config.json")
    if not os.path.exists(config_path):
        raise FileNotFoundError(
            f"config.json not found at {config_path}. "
            "Copy config.json.example to config.json and fill in your Composer API credentials."
        )
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(f"config.json is not valid JSON (line {e.lineno}). Check syntax.") from None

    if not isinstance(raw, dict) or "accounts" not in raw:
        raise ValueError("config.json must be a JSON object with an 'accounts' key.")

    _config_json_cache = raw
    return _config_json_cache


def load_accounts() -> List[AccountCredentials]:
    """Load Composer account credentials from config.json.

    Raises FileNotFoundError with a helpful message if the file is missing.
    """
    data = _load_config_json()
    account_list = data["accounts"]
    if not isinstance(account_list, list) or len(account_list) == 0:
        raise ValueError("config.json must contain a non-empty 'accounts' array.")
    try:
        accounts = [AccountCredentials(**entry) for entry in account_list]
    except Exception:
        raise ValueError(
            "config.json entries must have 'name', 'api_key_id', and 'api_secret' fields."
        ) from None
    logger.info("Loaded %d Composer account(s) from config.json", len(accounts))
    return accounts


def load_finnhub_key() -> Optional[str]:
    """Return the Finnhub API key from config.json, or None if not configured."""
    try:
        data = _load_config_json()
        key = data.get("finnhub_api_key", "")
        return key if key else None
    except Exception:
        return None


def load_polygon_key() -> Optional[str]:
    """Return the Polygon API key from config.json, or None if not configured."""
    try:
        data = _load_config_json()
        key = data.get("polygon_api_key", "")
        return key if key else None
    except Exception:
        return None


def _config_json_path() -> str:
    """Return path to config.json."""
    return os.path.join(_PROJECT_ROOT, "config.json")


def _save_config_json(data: dict):
    """Write updated config back to config.json and invalidate cache."""
    global _config_json_cache
    path = _config_json_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    _config_json_cache = data


def load_symphony_export_config() -> Optional[dict]:
    """Return the symphony_export config block, or None if not configured.

    Always re-reads config.json from disk so that external edits
    are picked up without restart.
    Returns dict with keys: local_path (str), google_drive (dict|None).
    """
    global _config_json_cache
    try:
        _config_json_cache = None  # invalidate cache
        data = _load_config_json()
        cfg = data.get("symphony_export")
        if not cfg or not isinstance(cfg, dict):
            return None
        return cfg
    except Exception:
        return None


def save_symphony_export_path(local_path: str):
    """Persist the symphony export local_path into config.json."""
    data = _load_config_json()
    if "symphony_export" not in data or not isinstance(data.get("symphony_export"), dict):
        data["symphony_export"] = {}
    data["symphony_export"]["local_path"] = local_path
    _save_config_json(data)


def load_screenshot_config() -> Optional[dict]:
    """Return the screenshot config block, or None if not configured.

    Always re-reads config.json from disk.
    """
    global _config_json_cache
    try:
        _config_json_cache = None
        data = _load_config_json()
        cfg = data.get("screenshot")
        if not cfg or not isinstance(cfg, dict):
            return None
        return cfg
    except Exception:
        return None


def save_screenshot_config(config: dict):
    """Persist the screenshot config block into config.json."""
    global _config_json_cache
    _config_json_cache = None
    data = _load_config_json()
    data["screenshot"] = config
    _save_config_json(data)
