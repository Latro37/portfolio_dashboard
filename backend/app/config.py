"""Application configuration loaded from config.json."""

import json
import logging
import os
from typing import List, Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Project root: two levels up from this file (backend/app/config.py -> project root)
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_DEFAULT_SYMPHONY_EXPORT_DIR = os.path.join(_PROJECT_ROOT, "symphony_exports")
_DEFAULT_DAILY_SNAPSHOT_DIR = os.path.join(_PROJECT_ROOT, "daily_snapshots")


def is_test_mode() -> bool:
    """Return True when test mode env flag is enabled via PD_TEST_MODE=1."""
    return os.environ.get("PD_TEST_MODE", "").strip() == "1"


def is_first_start_test_mode() -> bool:
    """Return True when first-start simulation mode is enabled."""
    return os.environ.get("PD_FIRST_START_TEST_MODE", "").strip() == "1"


def get_first_start_run_id() -> str:
    """Return the current first-start simulation run id, if provided."""
    return os.environ.get("PD_FIRST_START_RUN_ID", "").strip()


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

    Returns a dict with key 'composer_accounts' (or legacy 'accounts') and optionally
    'finnhub_api_key', 'settings', etc.
    """
    global _config_json_cache
    if _config_json_cache is not None:
        return _config_json_cache

    config_path = _config_json_path()
    if not os.path.exists(config_path):
        raise FileNotFoundError(
            f"config.json not found at {config_path}. "
            "Copy config.json.example to config.json and fill in your Composer API credentials."
        )
    try:
        # Be liberal in what we accept: Windows editors often add a UTF-8 BOM.
        with open(config_path, "r", encoding="utf-8-sig") as f:
            raw = json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(f"config.json is not valid JSON (line {e.lineno}). Check syntax.") from None

    if not isinstance(raw, dict) or ("composer_accounts" not in raw and "accounts" not in raw):
        raise ValueError(
            "config.json must be a JSON object with a 'composer_accounts' key "
            "(or legacy 'accounts')."
        )

    _config_json_cache = raw
    return _config_json_cache


def load_accounts() -> List[AccountCredentials]:
    """Load Composer account credentials from config.json.

    Raises FileNotFoundError with a helpful message if the file is missing.
    """
    data = _load_config_json()
    account_list = data.get("composer_accounts") or data.get("accounts")
    if not isinstance(account_list, list) or len(account_list) == 0:
        raise ValueError("config.json must contain a non-empty 'composer_accounts' array.")
    try:
        accounts = [AccountCredentials(**entry) for entry in account_list]
    except Exception:
        raise ValueError(
            "config.json entries must have 'name', 'api_key_id', and 'api_secret' fields."
        ) from None
    logger.info("Loaded %d Composer account(s) from config.json", len(accounts))
    return accounts


_PLACEHOLDER_API_KEY_ID = "your-api-key-id"
_PLACEHOLDER_API_SECRET = "your-api-secret"


def validate_composer_config() -> tuple[bool, Optional[str]]:
    """Validate config.json has usable Composer API credentials (non-test mode).

    This is intended for user-facing setup messaging and safe startup behavior.
    Returns (ok, error_message). Never raises.
    """
    if is_test_mode():
        return True, None

    config_path = _config_json_path()
    if not os.path.exists(config_path):
        return (
            False,
            "config.json not found. Copy config.json.example to config.json and add your Composer API credentials.",
        )

    try:
        # Be liberal in what we accept: Windows editors often add a UTF-8 BOM.
        with open(config_path, "r", encoding="utf-8-sig") as f:
            raw = json.load(f)
    except json.JSONDecodeError as e:
        return False, f"config.json is not valid JSON (line {e.lineno}). Check syntax and try again."
    except Exception as e:
        return False, f"Failed to read config.json: {e}"

    if not isinstance(raw, dict):
        return False, "config.json must be a JSON object. Re-copy config.json.example and try again."

    account_list = raw.get("composer_accounts") or raw.get("accounts")
    if account_list is None:
        return (
            False,
            "config.json is missing 'composer_accounts'. Copy config.json.example to config.json and fill in your Composer API credentials.",
        )

    if not isinstance(account_list, list) or len(account_list) == 0:
        return (
            False,
            "config.json must contain a non-empty 'composer_accounts' array. Copy config.json.example to config.json and fill in your Composer API credentials.",
        )

    problems: list[str] = []
    for idx, entry in enumerate(account_list):
        if not isinstance(entry, dict):
            problems.append(f"composer_accounts[{idx}] must be an object with name/api_key_id/api_secret")
            continue
        name_raw = entry.get("name")
        name_str = name_raw.strip() if isinstance(name_raw, str) else ""
        name = name_str or f"#{idx + 1}"
        key_id = entry.get("api_key_id")
        secret = entry.get("api_secret")

        key_id_str = key_id.strip() if isinstance(key_id, str) else ""
        secret_str = secret.strip() if isinstance(secret, str) else ""

        missing_fields = []
        if not name_str:
            missing_fields.append("name missing")
        if not key_id_str:
            missing_fields.append("api_key_id missing")
        elif key_id_str.lower() == _PLACEHOLDER_API_KEY_ID:
            missing_fields.append("api_key_id is placeholder")
        if not secret_str:
            missing_fields.append("api_secret missing")
        elif secret_str.lower() == _PLACEHOLDER_API_SECRET:
            missing_fields.append("api_secret is placeholder")

        if missing_fields:
            problems.append(f"composer_accounts[{idx}] (name: {name}): " + ", ".join(missing_fields))

    if problems:
        msg = (
            "Composer API credentials are not configured in config.json.\n"
            "Update composer_accounts[*].api_key_id and composer_accounts[*].api_secret with real values from Composer (Settings -> API Keys), then restart.\n"
            "Details:\n- "
            + "\n- ".join(problems)
        )
        return False, msg

    return True, None


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
    """Return path to config.json (or PD_CONFIG_PATH override)."""
    env_path = os.environ.get("PD_CONFIG_PATH", "").strip()
    if env_path:
        if os.path.isabs(env_path):
            return env_path
        return os.path.join(_PROJECT_ROOT, env_path)
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
    """Return the symphony_export config block.

    Always re-reads config.json from disk so that external edits
    are picked up without restart.
    Returns dict with keys: enabled (bool), local_path (str), google_drive (dict|None).
    """
    global _config_json_cache
    try:
        _config_json_cache = None  # invalidate cache
        data = _load_config_json()
        cfg = data.get("symphony_export")
        if not cfg or not isinstance(cfg, dict):
            return {"enabled": True, "local_path": _DEFAULT_SYMPHONY_EXPORT_DIR}
        local_path = str(cfg.get("local_path") or "").strip()
        enabled = bool(cfg.get("enabled", True))
        if not local_path:
            return {**cfg, "enabled": enabled, "local_path": _DEFAULT_SYMPHONY_EXPORT_DIR}
        return {**cfg, "enabled": enabled, "local_path": local_path}
    except Exception:
        return {"enabled": True, "local_path": _DEFAULT_SYMPHONY_EXPORT_DIR}


def save_symphony_export_path(local_path: str):
    """Persist the symphony export local_path into config.json."""
    save_symphony_export_config(local_path=local_path, enabled=True)


def save_symphony_export_config(*, local_path: str, enabled: bool):
    """Persist symphony export config into config.json."""
    data = _load_config_json()
    if "symphony_export" not in data or not isinstance(data.get("symphony_export"), dict):
        data["symphony_export"] = {}
    data["symphony_export"]["local_path"] = local_path
    data["symphony_export"]["enabled"] = bool(enabled)
    _save_config_json(data)


def load_screenshot_config() -> Optional[dict]:
    """Return the daily snapshot config block.

    Always re-reads config.json from disk.
    """
    global _config_json_cache
    try:
        _config_json_cache = None
        data = _load_config_json()
        # New key: daily_snapshot. Back-compat: screenshot.
        cfg = data.get("daily_snapshot")
        if not cfg:
            cfg = data.get("screenshot")
        if not cfg or not isinstance(cfg, dict):
            return {"enabled": False, "local_path": _DEFAULT_DAILY_SNAPSHOT_DIR}
        local_path = str(cfg.get("local_path") or "").strip()
        if not local_path:
            return {**cfg, "local_path": _DEFAULT_DAILY_SNAPSHOT_DIR}
        return cfg
    except Exception:
        return {"enabled": False, "local_path": _DEFAULT_DAILY_SNAPSHOT_DIR}


def save_screenshot_config(config: dict):
    """Persist the daily snapshot config block into config.json."""
    global _config_json_cache
    _config_json_cache = None
    data = _load_config_json()
    data["daily_snapshot"] = config
    # Clean up legacy key if present.
    data.pop("screenshot", None)
    _save_config_json(data)
