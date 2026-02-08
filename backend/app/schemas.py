"""Pydantic schemas for API request/response models."""

from datetime import date
from typing import List, Optional
from pydantic import BaseModel


# --- Sync ---
class SyncStatus(BaseModel):
    status: str  # idle / syncing / error
    last_sync_date: Optional[str] = None
    initial_backfill_done: bool = False
    message: str = ""


# --- Portfolio ---
class DailyPortfolioRow(BaseModel):
    date: date
    portfolio_value: float
    cash_balance: float
    net_deposits: float
    total_fees: float
    total_dividends: float


class DailyMetricsRow(BaseModel):
    date: date
    daily_return_pct: float
    cumulative_return_pct: float
    total_return_dollars: float
    cagr: float
    annualized_return: float
    time_weighted_return: float
    money_weighted_return: float
    win_rate: float
    num_wins: int
    num_losses: int
    avg_win_pct: float
    avg_loss_pct: float
    max_drawdown: float
    current_drawdown: float
    sharpe_ratio: float
    calmar_ratio: float
    sortino_ratio: float
    annualized_volatility: float
    best_day_pct: float
    worst_day_pct: float
    profit_factor: float


class PortfolioSummary(BaseModel):
    portfolio_value: float
    net_deposits: float
    total_return_dollars: float
    daily_return_pct: float
    cumulative_return_pct: float
    cagr: float
    time_weighted_return: float
    money_weighted_return: float
    sharpe_ratio: float
    calmar_ratio: float
    sortino_ratio: float
    max_drawdown: float
    current_drawdown: float
    win_rate: float
    num_wins: int
    num_losses: int
    avg_win_pct: float
    avg_loss_pct: float
    annualized_volatility: float
    best_day_pct: float
    worst_day_pct: float
    profit_factor: float
    total_fees: float
    total_dividends: float
    last_updated: Optional[str] = None


# --- Holdings ---
class HoldingSnapshot(BaseModel):
    symbol: str
    quantity: float
    allocation_pct: Optional[float] = None


class HoldingsForDate(BaseModel):
    date: date
    holdings: List[HoldingSnapshot]


# --- Transactions ---
class TransactionRow(BaseModel):
    date: date
    symbol: str
    action: str
    quantity: float
    price: float
    total_amount: float


# --- Cash Flows ---
class CashFlowRow(BaseModel):
    date: date
    type: str
    amount: float
    description: str = ""


# --- Performance chart data ---
class PerformancePoint(BaseModel):
    date: date
    portfolio_value: float
    net_deposits: float
    cumulative_return_pct: float
    daily_return_pct: float
