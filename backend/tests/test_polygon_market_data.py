from __future__ import annotations

from datetime import date

import pytest

from app.services import finnhub_market_data


class _FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code
        self.ok = 200 <= status_code < 300

    def json(self):
        return self._payload


def test_get_daily_closes_polygon_accepts_delayed_status(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(finnhub_market_data, "load_polygon_key", lambda: "test-key")
    monkeypatch.setattr(
        finnhub_market_data.requests,
        "get",
        lambda *_args, **_kwargs: _FakeResponse(
            {
                "status": "DELAYED",
                "results": [
                    {"t": 1735776000000, "c": 584.64},  # 2025-01-02 UTC
                    {"t": 1735862400000, "c": 591.95},  # 2025-01-03 UTC
                ],
            }
        ),
    )

    rows = finnhub_market_data.get_daily_closes_polygon(
        "SPY",
        date(2025, 1, 2),
        date(2025, 1, 3),
    )

    assert rows == [
        (date(2025, 1, 2), 584.64),
        (date(2025, 1, 3), 591.95),
    ]
