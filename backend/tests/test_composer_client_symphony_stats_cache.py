from __future__ import annotations

import requests
import pytest

import app.composer_client as composer_client
from app.composer_client import ComposerClient


class _DummyResponse:
    def __init__(
        self,
        status_code: int,
        payload: dict | None = None,
        *,
        headers: dict | None = None,
        text: str = "",
    ):
        self.status_code = status_code
        self._payload = payload or {}
        self.headers = headers or {}
        self.text = text

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            err = requests.exceptions.HTTPError(f"{self.status_code} error")
            err.response = self
            raise err


@pytest.fixture(autouse=True)
def _clear_symphony_stats_cache():
    composer_client._clear_symphony_stats_cache_for_tests()
    yield
    composer_client._clear_symphony_stats_cache_for_tests()


def test_get_symphony_stats_reuses_recent_cache(monkeypatch: pytest.MonkeyPatch):
    call_count = 0

    def _fake_get(*_args, **_kwargs):
        nonlocal call_count
        call_count += 1
        return _DummyResponse(
            200,
            {"symphonies": [{"id": "sym-1", "name": "Momentum"}]},
        )

    times = iter([100.0, 101.0])
    monkeypatch.setattr(composer_client.requests, "get", _fake_get)
    monkeypatch.setattr(composer_client.time, "monotonic", lambda: next(times))

    client = ComposerClient("key-1", "secret-1", base_url="https://unit.test")
    first = client.get_symphony_stats("acct-1")
    second = client.get_symphony_stats("acct-1")

    assert first == [{"id": "sym-1", "name": "Momentum"}]
    assert second == first
    assert call_count == 1


def test_get_symphony_stats_falls_back_to_cached_payload_after_429(
    monkeypatch: pytest.MonkeyPatch,
):
    call_count = 0
    responses = [
        _DummyResponse(200, {"symphonies": [{"id": "sym-2", "name": "Value"}]}),
        _DummyResponse(
            429,
            {"errors": [{"status": 429}]},
            text='{"errors":[{"status":429}]}',
        ),
    ]

    def _fake_get(*_args, **_kwargs):
        nonlocal call_count
        call_count += 1
        return responses.pop(0)

    times = iter([200.0, 220.0, 221.0])
    monkeypatch.setattr(composer_client.requests, "get", _fake_get)
    monkeypatch.setattr(composer_client.time, "monotonic", lambda: next(times))

    client = ComposerClient("key-2", "secret-2", base_url="https://unit.test")
    first = client.get_symphony_stats("acct-2")
    second = client.get_symphony_stats("acct-2")
    third = client.get_symphony_stats("acct-2")

    expected = [{"id": "sym-2", "name": "Value"}]
    assert first == expected
    assert second == expected
    assert third == expected
    # Third read is served from cooldown cache without another HTTP call.
    assert call_count == 2


def test_get_symphony_stats_returns_empty_during_429_cooldown_without_cache(
    monkeypatch: pytest.MonkeyPatch,
):
    call_count = 0

    def _fake_get(*_args, **_kwargs):
        nonlocal call_count
        call_count += 1
        return _DummyResponse(
            429,
            {"errors": [{"status": 429}]},
            text='{"errors":[{"status":429}]}',
        )

    times = iter([300.0, 301.0])
    monkeypatch.setattr(composer_client.requests, "get", _fake_get)
    monkeypatch.setattr(composer_client.time, "monotonic", lambda: next(times))

    client = ComposerClient("key-3", "secret-3", base_url="https://unit.test")
    first = client.get_symphony_stats("acct-3")
    second = client.get_symphony_stats("acct-3")

    assert first == []
    assert second == []
    # Second call is suppressed by cooldown and does not hit Composer again.
    assert call_count == 1
