from __future__ import annotations


def test_list_symphonies_contract(client):
    res = client.get("/api/symphonies?account_id=test-account-001")
    assert res.status_code == 200
    payload = res.json()
    assert isinstance(payload, list)
    assert len(payload) > 0

    row = next((r for r in payload if r.get("id") == "test-sym-000"), payload[0])
    assert set(row.keys()) == {
        "id",
        "position_id",
        "account_id",
        "account_name",
        "name",
        "color",
        "value",
        "net_deposits",
        "cash",
        "total_return",
        "cumulative_return_pct",
        "simple_return",
        "time_weighted_return",
        "last_dollar_change",
        "last_percent_change",
        "sharpe_ratio",
        "max_drawdown",
        "annualized_return",
        "invested_since",
        "last_rebalance_on",
        "next_rebalance_on",
        "rebalance_frequency",
        "holdings",
    }


def test_symphony_performance_contract(client):
    res = client.get("/api/symphonies/test-sym-000/performance?account_id=test-account-001")
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


def test_symphony_summary_contract(client):
    res = client.get("/api/symphonies/test-sym-000/summary?account_id=test-account-001&period=ALL")
    assert res.status_code == 200
    payload = res.json()
    assert set(payload.keys()) == {
        "symphony_id",
        "account_id",
        "period",
        "start_date",
        "end_date",
        "portfolio_value",
        "net_deposits",
        "total_return_dollars",
        "cumulative_return_pct",
        "time_weighted_return",
        "money_weighted_return",
        "money_weighted_return_period",
        "cagr",
        "annualized_return",
        "annualized_return_cum",
        "sharpe_ratio",
        "sortino_ratio",
        "calmar_ratio",
        "max_drawdown",
        "current_drawdown",
        "annualized_volatility",
        "win_rate",
        "num_wins",
        "num_losses",
        "best_day_pct",
        "worst_day_pct",
        "profit_factor",
        "daily_return_pct",
    }
    assert payload["symphony_id"] == "test-sym-000"
