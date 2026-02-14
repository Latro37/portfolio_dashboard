from __future__ import annotations


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
