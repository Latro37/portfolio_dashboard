"""Shared fixtures for metric tests."""

import pytest
from datetime import date, timedelta


@pytest.fixture
def simple_series():
    """5 days, no deposits, steady ~1% daily growth.

    Day 0: $10,000  (deposit $10,000)
    Day 1: $10,100
    Day 2: $10,201
    Day 3: $10,303.01
    Day 4: $10,406.04
    """
    base = 10_000.0
    values = [base]
    for _ in range(4):
        values.append(round(values[-1] * 1.01, 2))
    start = date(2024, 1, 2)  # Tuesday
    return {
        "daily_rows": [
            {"date": start + timedelta(days=i), "portfolio_value": values[i], "net_deposits": base}
            for i in range(5)
        ],
        "cash_flows": [],
        "pv": values,
        "deposits": [base] * 5,
        "dates": [start + timedelta(days=i) for i in range(5)],
    }


@pytest.fixture
def deposit_series():
    """10 days with a $5,000 deposit on day 5.

    Day 0-4: starts at $10,000, grows ~1%/day
    Day 5: deposit $5,000 (value jumps), then continues ~1%/day
    """
    base_deposit = 10_000.0
    values = [base_deposit]
    net_deps = [base_deposit]
    for i in range(1, 10):
        prev = values[-1]
        if i == 5:
            # Deposit $5,000, then grow
            new_val = round((prev + 5000) * 1.01, 2)
            values.append(new_val)
            net_deps.append(base_deposit + 5000)
        else:
            values.append(round(prev * 1.01, 2))
            net_deps.append(net_deps[-1])
    start = date(2024, 1, 2)
    cash_flow_events = [{"date": start + timedelta(days=5), "amount": 5000.0}]
    return {
        "daily_rows": [
            {"date": start + timedelta(days=i), "portfolio_value": values[i], "net_deposits": net_deps[i]}
            for i in range(10)
        ],
        "cash_flows": cash_flow_events,
        "pv": values,
        "deposits": net_deps,
        "dates": [start + timedelta(days=i) for i in range(10)],
    }


@pytest.fixture
def drawdown_series():
    """Series that rises, drops 20%, then recovers.

    Day 0: $10,000
    Day 1: $11,000  (+10%)
    Day 2: $12,000  (+9.09%)
    Day 3: $9,600   (-20%)  ← drawdown from peak $12,000
    Day 4: $10,800  (+12.5%)
    Day 5: $12,500  (+15.74%) ← new peak, full recovery
    """
    values = [10000, 11000, 12000, 9600, 10800, 12500]
    dep = 10000.0
    start = date(2024, 1, 2)
    return {
        "daily_rows": [
            {"date": start + timedelta(days=i), "portfolio_value": float(values[i]), "net_deposits": dep}
            for i in range(6)
        ],
        "cash_flows": [],
        "pv": [float(v) for v in values],
        "deposits": [dep] * 6,
        "dates": [start + timedelta(days=i) for i in range(6)],
    }


@pytest.fixture
def flat_series():
    """5 days, no change. All returns should be zero."""
    val = 10_000.0
    start = date(2024, 1, 2)
    return {
        "daily_rows": [
            {"date": start + timedelta(days=i), "portfolio_value": val, "net_deposits": val}
            for i in range(5)
        ],
        "cash_flows": [],
        "pv": [val] * 5,
        "deposits": [val] * 5,
        "dates": [start + timedelta(days=i) for i in range(5)],
    }
