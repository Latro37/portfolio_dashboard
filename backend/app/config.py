"""Application configuration loaded from environment variables and accounts.json."""

import json
import logging
import os
from typing import List

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


def load_accounts() -> List[AccountCredentials]:
    """Load Composer account credentials from accounts.json.

    Raises FileNotFoundError with a helpful message if the file is missing.
    """
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
    if not isinstance(raw, list) or len(raw) == 0:
        raise ValueError("accounts.json must be a non-empty JSON array of account objects.")
    try:
        accounts = [AccountCredentials(**entry) for entry in raw]
    except Exception:
        raise ValueError(
            "accounts.json entries must have 'name', 'api_key_id', and 'api_secret' fields."
        ) from None
    logger.info("Loaded %d Composer account(s) from accounts.json", len(accounts))
    return accounts
