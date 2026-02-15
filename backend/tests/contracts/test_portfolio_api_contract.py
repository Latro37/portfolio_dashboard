from __future__ import annotations

import os

import app.services.portfolio_admin as portfolio_admin


def test_accounts_contract(client):
    res = client.get("/api/accounts")
    assert res.status_code == 200
    payload = res.json()
    assert isinstance(payload, list)
    assert len(payload) == 1
    assert set(payload[0].keys()) == {
        "id",
        "credential_name",
        "account_type",
        "display_name",
        "status",
    }
    assert payload[0]["id"] == "test-account-001"


def test_summary_contract(client):
    res = client.get("/api/summary?account_id=test-account-001&period=ALL")
    assert res.status_code == 200
    payload = res.json()
    assert set(payload.keys()) == {
        "portfolio_value",
        "net_deposits",
        "total_return_dollars",
        "daily_return_pct",
        "cumulative_return_pct",
        "cagr",
        "annualized_return",
        "annualized_return_cum",
        "time_weighted_return",
        "money_weighted_return",
        "money_weighted_return_period",
        "sharpe_ratio",
        "calmar_ratio",
        "sortino_ratio",
        "max_drawdown",
        "max_drawdown_date",
        "current_drawdown",
        "win_rate",
        "num_wins",
        "num_losses",
        "avg_win_pct",
        "avg_loss_pct",
        "annualized_volatility",
        "best_day_pct",
        "best_day_date",
        "worst_day_pct",
        "worst_day_date",
        "profit_factor",
        "median_drawdown",
        "longest_drawdown_days",
        "median_drawdown_days",
        "total_fees",
        "total_dividends",
        "last_updated",
    }
    assert payload["portfolio_value"] == 102500.0
    assert payload["net_deposits"] == 100000.0


def test_performance_contract(client):
    res = client.get("/api/performance?account_id=test-account-001&period=ALL")
    assert res.status_code == 200
    payload = res.json()
    assert isinstance(payload, list)
    assert len(payload) == 3
    assert set(payload[0].keys()) == {
        "date",
        "portfolio_value",
        "net_deposits",
        "cumulative_return_pct",
        "daily_return_pct",
        "time_weighted_return",
        "money_weighted_return",
        "current_drawdown",
    }


def test_sync_status_contract(client):
    res = client.get("/api/sync/status?account_id=test-account-001")
    assert res.status_code == 200
    payload = res.json()
    assert set(payload.keys()) == {
        "status",
        "last_sync_date",
        "initial_backfill_done",
        "message",
    }
    assert payload["status"] == "idle"
    assert payload["last_sync_date"] is None
    assert payload["initial_backfill_done"] is False


def test_sync_trigger_skips_test_accounts_contract(client, auth_headers):
    res = client.post("/api/sync?account_id=all", headers=auth_headers)
    assert res.status_code == 200
    payload = res.json()
    assert payload["status"] == "skipped"
    assert payload["synced_accounts"] == 0
    assert payload["reason"] == "No sync-eligible accounts"


def test_config_contract(client):
    res = client.get("/api/config")
    assert res.status_code == 200
    payload = res.json()
    assert set(payload.keys()) == {
        "finnhub_api_key",
        "finnhub_configured",
        "polygon_configured",
        "local_auth_token",
        "symphony_export",
        "screenshot",
        "test_mode",
    }
    assert payload["test_mode"] is True
    assert payload["local_auth_token"] == "contract-test-token"


def test_config_symphony_export_contract(client, monkeypatch, auth_headers):
    captured = {"path": ""}

    def _save(path: str):
        captured["path"] = path

    monkeypatch.setattr(portfolio_admin, "save_symphony_export_path", _save)
    res = client.post(
        "/api/config/symphony-export",
        json={"local_path": "exports"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["ok"] is True
    assert payload["local_path"] == captured["path"]
    assert payload["local_path"].endswith(
        os.path.join("data", "local_storage", "exports")
    )


def test_config_screenshot_contract(client, monkeypatch, auth_headers):
    captured = {}

    def _save(cfg):
        captured.update(cfg)

    monkeypatch.setattr(portfolio_admin, "save_screenshot_config", _save)
    res = client.post(
        "/api/config/screenshot",
        json={
            "local_path": "screenshots",
            "enabled": True,
            "account_id": "test-account-001",
            "chart_mode": "twr",
            "period": "1Y",
            "custom_start": "",
            "hide_portfolio_value": False,
            "metrics": ["total_return_dollars"],
            "benchmarks": ["SPY"],
        },
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    assert captured["local_path"].endswith(
        os.path.join("data", "local_storage", "screenshots")
    )


def test_manual_cash_flow_contract(client, auth_headers):
    res = client.post(
        "/api/cash-flows/manual",
        json={
            "account_id": "test-account-001",
            "date": "2025-01-05",
            "type": "withdrawal",
            "amount": 123.45,
            "description": "Manual correction",
        },
        headers=auth_headers,
    )
    assert res.status_code == 200
    payload = res.json()
    assert set(payload.keys()) == {"status", "date", "type", "amount"}
    assert payload["status"] == "ok"
    assert payload["date"] == "2025-01-05"
    assert payload["type"] == "withdrawal"
    assert payload["amount"] == -123.45


def test_sync_requires_local_auth_token(client):
    res = client.post("/api/sync?account_id=all")
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid local auth token"


def test_mutation_rejects_cross_origin_even_with_token(client, auth_headers):
    res = client.post(
        "/api/sync?account_id=all",
        headers={**auth_headers, "Origin": "https://evil.example"},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "Origin not allowed"


def test_export_path_allows_parent_segments(client, auth_headers):
    res = client.post(
        "/api/config/symphony-export",
        json={"local_path": "../outside"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["ok"] is True
    assert payload["local_path"].endswith(os.path.join("data", "outside"))
