"""Application configuration loaded from environment variables."""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Composer API
    composer_api_key_id: str = ""
    composer_api_secret: str = ""
    composer_account_id: str = ""
    composer_api_base_url: str = "https://api.composer.trade"

    # Database
    database_url: str = "sqlite:///data/portfolio.db"

    # Market / Analytics
    benchmark_ticker: str = "SPY"
    risk_free_rate: float = 0.05  # annualized

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_settings() -> Settings:
    """Load settings, searching for .env in project root."""
    # Walk up to find .env relative to this file
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    env_path = os.path.join(root, ".env")
    if os.path.exists(env_path):
        return Settings(_env_file=env_path)
    return Settings()
