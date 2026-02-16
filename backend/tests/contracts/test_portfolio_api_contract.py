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


def test_symphony_export_status_contract(client):
    res = client.get("/api/symphony-export/status")
    assert res.status_code == 200
    payload = res.json()
    assert set(payload.keys()) == {
        "status",
        "job_id",
        "exported",
        "processed",
        "total",
        "message",
        "error",
    }
    assert payload["status"] in {"idle", "running", "complete", "error"}
    assert isinstance(payload["exported"], int)
    assert isinstance(payload["processed"], int)
    assert payload["total"] is None or isinstance(payload["total"], int)
    assert isinstance(payload["message"], str)
    assert payload["job_id"] is None or isinstance(payload["job_id"], str)
    assert payload["error"] is None or isinstance(payload["error"], str)


def test_sync_trigger_skips_test_accounts_contract(client, auth_headers):
    res = client.post("/api/sync?account_id=all", headers=auth_headers)
    assert res.status_code == 200
    payload = res.json()
    assert payload["status"] == "skipped"
    assert payload["synced_accounts"] == 0
    assert payload["reason"] == "No sync-eligible accounts"


def test_config_contract(client):
    res = client.get("/api/config", headers={"Origin": "http://localhost:3000"})
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
        "composer_config_ok",
        "composer_config_error",
    }
    assert payload["test_mode"] is True
    assert payload["local_auth_token"] == "contract-test-token"
    assert payload["composer_config_ok"] is True
    assert payload["composer_config_error"] is None


def test_config_requires_origin_header(client):
    res = client.get("/api/config")
    assert res.status_code == 403
    assert res.json()["detail"] == "Origin header required"


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


def test_manual_cash_flow_invalidates_live_caches(client, auth_headers, monkeypatch):
    calls = {"portfolio": [], "symphony": []}

    def _invalidate_portfolio_live_cache(*, account_ids=None):
        calls["portfolio"].append(account_ids)
        return 1

    def _invalidate_symphony_live_cache(*, account_id=None, symphony_id=None):
        calls["symphony"].append((account_id, symphony_id))
        return 1

    monkeypatch.setattr(
        portfolio_admin,
        "invalidate_portfolio_live_cache",
        _invalidate_portfolio_live_cache,
    )
    monkeypatch.setattr(
        portfolio_admin,
        "invalidate_symphony_live_cache",
        _invalidate_symphony_live_cache,
    )

    res = client.post(
        "/api/cash-flows/manual",
        json={
            "account_id": "test-account-001",
            "date": "2025-01-05",
            "type": "deposit",
            "amount": 250.00,
            "description": "Manual contribution",
        },
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert calls["portfolio"] == [["test-account-001"]]
    assert calls["symphony"] == [("test-account-001", None)]


def test_cash_flows_row_contract(client):
    res = client.get("/api/cash-flows?account_id=test-account-001")
    assert res.status_code == 200
    payload = res.json()
    assert isinstance(payload, list)
    assert len(payload) >= 1
    assert set(payload[0].keys()) == {
        "id",
        "date",
        "type",
        "amount",
        "description",
        "account_id",
        "account_name",
        "is_manual",
    }
    assert payload[0]["is_manual"] is False


def test_delete_manual_cash_flow_contract(client, auth_headers):
    create_res = client.post(
        "/api/cash-flows/manual",
        json={
            "account_id": "test-account-001",
            "date": "2025-01-05",
            "type": "deposit",
            "amount": 250.00,
            "description": "Manual contribution",
        },
        headers=auth_headers,
    )
    assert create_res.status_code == 200

    list_res = client.get("/api/cash-flows?account_id=test-account-001")
    assert list_res.status_code == 200
    manual_rows = [row for row in list_res.json() if row["is_manual"]]
    assert len(manual_rows) == 1
    manual_id = manual_rows[0]["id"]

    delete_res = client.delete(f"/api/cash-flows/manual/{manual_id}", headers=auth_headers)
    assert delete_res.status_code == 200
    payload = delete_res.json()
    assert set(payload.keys()) == {"status", "deleted_id"}
    assert payload["status"] == "ok"
    assert payload["deleted_id"] == manual_id

    after_delete = client.get("/api/cash-flows?account_id=test-account-001")
    assert after_delete.status_code == 200
    after_ids = {row["id"] for row in after_delete.json()}
    assert manual_id not in after_ids


def test_delete_manual_cash_flow_invalidates_live_caches(client, auth_headers, monkeypatch):
    calls = {"portfolio": [], "symphony": []}

    def _invalidate_portfolio_live_cache(*, account_ids=None):
        calls["portfolio"].append(account_ids)
        return 1

    def _invalidate_symphony_live_cache(*, account_id=None, symphony_id=None):
        calls["symphony"].append((account_id, symphony_id))
        return 1

    monkeypatch.setattr(
        portfolio_admin,
        "invalidate_portfolio_live_cache",
        _invalidate_portfolio_live_cache,
    )
    monkeypatch.setattr(
        portfolio_admin,
        "invalidate_symphony_live_cache",
        _invalidate_symphony_live_cache,
    )

    create_res = client.post(
        "/api/cash-flows/manual",
        json={
            "account_id": "test-account-001",
            "date": "2025-01-05",
            "type": "deposit",
            "amount": 250.00,
            "description": "Manual contribution",
        },
        headers=auth_headers,
    )
    assert create_res.status_code == 200
    calls["portfolio"].clear()
    calls["symphony"].clear()

    list_res = client.get("/api/cash-flows?account_id=test-account-001")
    assert list_res.status_code == 200
    manual_rows = [row for row in list_res.json() if row["is_manual"]]
    assert len(manual_rows) == 1
    manual_id = manual_rows[0]["id"]

    delete_res = client.delete(f"/api/cash-flows/manual/{manual_id}", headers=auth_headers)
    assert delete_res.status_code == 200
    assert calls["portfolio"] == [["test-account-001"]]
    assert calls["symphony"] == [("test-account-001", None)]


def test_delete_manual_cash_flow_rejects_non_manual_row(client, auth_headers):
    list_res = client.get("/api/cash-flows?account_id=test-account-001")
    assert list_res.status_code == 200
    seeded_row_id = list_res.json()[0]["id"]

    delete_res = client.delete(f"/api/cash-flows/manual/{seeded_row_id}", headers=auth_headers)
    assert delete_res.status_code == 400
    assert delete_res.json()["detail"] == "Only manual deposit/withdrawal entries can be deleted"


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
