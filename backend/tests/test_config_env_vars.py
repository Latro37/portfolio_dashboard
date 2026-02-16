from __future__ import annotations

import json

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


def test_config_path_override(monkeypatch: pytest.MonkeyPatch, tmp_path):
    cfg_path = tmp_path / "config.override.json"
    cfg_path.write_text(
        json.dumps(
            {
                "composer_accounts": [
                    {
                        "name": "Primary",
                        "api_key_id": "k",
                        "api_secret": "s",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setenv("PD_CONFIG_PATH", str(cfg_path))
    monkeypatch.setattr(config, "_config_json_cache", None)
    accounts = config.load_accounts()
    assert len(accounts) == 1
    assert accounts[0].name == "Primary"


def test_symphony_export_defaults_enabled_when_block_missing(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(config, "_config_json_cache", None)
    monkeypatch.setattr(
        config,
        "_load_config_json",
        lambda: {
            "composer_accounts": [
                {"name": "Primary", "api_key_id": "k", "api_secret": "s"}
            ]
        },
    )

    export_cfg = config.load_symphony_export_config()
    assert export_cfg is not None
    assert export_cfg["enabled"] is True
    assert isinstance(export_cfg["local_path"], str)
    assert export_cfg["local_path"]


def test_symphony_export_defaults_enabled_when_flag_omitted(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(config, "_config_json_cache", None)
    monkeypatch.setattr(
        config,
        "_load_config_json",
        lambda: {
            "composer_accounts": [
                {"name": "Primary", "api_key_id": "k", "api_secret": "s"}
            ],
            "symphony_export": {"local_path": "exports"},
        },
    )

    export_cfg = config.load_symphony_export_config()
    assert export_cfg is not None
    assert export_cfg["enabled"] is True
