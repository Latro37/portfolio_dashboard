from __future__ import annotations


def test_benchmark_history_contract(client):
    res = client.get(
        "/api/benchmark-history"
        "?ticker=SPY"
        "&account_id=test-account-001"
        "&start_date=2025-01-02"
        "&end_date=2025-01-04"
    )
    assert res.status_code == 200
    payload = res.json()

    assert set(payload.keys()) == {"ticker", "data"}
    assert payload["ticker"] == "SPY"
    assert isinstance(payload["data"], list)
    assert len(payload["data"]) == 3
    assert set(payload["data"][0].keys()) == {
        "date",
        "close",
        "return_pct",
        "drawdown_pct",
        "mwr_pct",
    }
