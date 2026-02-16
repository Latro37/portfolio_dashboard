from __future__ import annotations

from app.security import get_allowed_origins


def test_allowed_origins_defaults_without_env(monkeypatch):
    monkeypatch.delenv("PD_ALLOWED_ORIGINS", raising=False)
    assert get_allowed_origins() == {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }


def test_allowed_origins_parses_quoted_env_values(monkeypatch):
    monkeypatch.setenv(
        "PD_ALLOWED_ORIGINS",
        '"http://localhost:3010","http://127.0.0.1:3010"',
    )
    assert get_allowed_origins() == {
        "http://localhost:3010",
        "http://127.0.0.1:3010",
    }


def test_allowed_origins_falls_back_when_env_has_no_loopback(monkeypatch):
    monkeypatch.setenv("PD_ALLOWED_ORIGINS", "https://evil.example")
    assert get_allowed_origins() == {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }
