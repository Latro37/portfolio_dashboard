from __future__ import annotations

import pytest

from app.services import sync


def test_safe_step_retries_and_succeeds(monkeypatch: pytest.MonkeyPatch):
    calls = {"count": 0}
    sleeps: list[float] = []

    def _flaky():
        calls["count"] += 1
        if calls["count"] < 3:
            raise RuntimeError("temporary failure")

    monkeypatch.setattr(sync.time, "sleep", lambda seconds: sleeps.append(seconds))

    ok = sync._safe_step(
        "flaky",
        _flaky,
        retries=2,
        retry_delay_seconds=1.5,
    )

    assert ok is True
    assert calls["count"] == 3
    assert sleeps == [1.5, 1.5]


def test_safe_step_returns_false_after_exhausting_retries(monkeypatch: pytest.MonkeyPatch):
    calls = {"count": 0}
    sleeps: list[float] = []

    def _always_fail():
        calls["count"] += 1
        raise RuntimeError("permanent failure")

    monkeypatch.setattr(sync.time, "sleep", lambda seconds: sleeps.append(seconds))

    ok = sync._safe_step(
        "always_fail",
        _always_fail,
        retries=2,
        retry_delay_seconds=0.75,
    )

    assert ok is False
    assert calls["count"] == 3
    assert sleeps == [0.75, 0.75]


def test_safe_step_raises_after_exhausting_retries(monkeypatch: pytest.MonkeyPatch):
    calls = {"count": 0}
    sleeps: list[float] = []

    def _always_fail():
        calls["count"] += 1
        raise RuntimeError("hard failure")

    monkeypatch.setattr(sync.time, "sleep", lambda seconds: sleeps.append(seconds))

    with pytest.raises(RuntimeError, match="hard failure"):
        sync._safe_step(
            "always_fail",
            _always_fail,
            retries=2,
            retry_delay_seconds=0.25,
            raise_on_failure=True,
        )

    assert calls["count"] == 3
    assert sleeps == [0.25, 0.25]
