from __future__ import annotations

import pytest

from app import config


def test_is_test_mode_uses_pd_env_only(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("PD_TEST_MODE", raising=False)
    monkeypatch.setenv("CPV_TEST_MODE", "1")
    assert config.is_test_mode() is False

    monkeypatch.setenv("PD_TEST_MODE", "1")
    assert config.is_test_mode() is True


def test_get_settings_ignores_legacy_db_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("PD_DATABASE_URL", raising=False)
    monkeypatch.setenv("CPV_DATABASE_URL", "sqlite:///data/legacy_alias_should_not_apply.db")
    monkeypatch.setattr(
        config,
        "_load_config_json",
        lambda: {"settings": {"database_url": "sqlite:///data/from_config_json.db"}},
    )

    settings = config.get_settings()
    assert settings.database_url == "sqlite:///data/from_config_json.db"

    monkeypatch.setenv("PD_DATABASE_URL", "sqlite:///data/from_pd_env.db")
    settings = config.get_settings()
    assert settings.database_url == "sqlite:///data/from_pd_env.db"
