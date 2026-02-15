from __future__ import annotations

import pytest

from app.services.sync import _refresh_symphony_catalog_safe


def test_refresh_symphony_catalog_safe_uses_service_layer(monkeypatch: pytest.MonkeyPatch):
    called = {"value": False}

    def _fake_refresh(_db):
        called["value"] = True

    monkeypatch.setattr("app.services.symphony_catalog._refresh_symphony_catalog", _fake_refresh)
    _refresh_symphony_catalog_safe(object())
    assert called["value"] is True
