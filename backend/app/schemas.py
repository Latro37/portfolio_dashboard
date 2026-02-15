"""Pydantic schemas for API request/response models."""

from datetime import date
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


# --- Accounts ---
class AccountInfo(BaseModel):
    id: str
    credential_name: str
    account_type: str
    display_name: str
    status: str


# --- Manual Cash Flow ---
class ManualCashFlowRequest(BaseModel):
    account_id: str
    date: date
    type: str = "deposit"  # deposit / withdrawal
    amount: float
    description: str = ""


class ManualCashFlowResponse(BaseModel):
    status: str
    date: str
    type: str
    amount: float


# --- Sync ---
class SyncStatus(BaseModel):
    status: str  # idle / syncing / error
    last_sync_date: Optional[str] = None
    initial_backfill_done: bool = False
    message: str = ""


class SyncTriggerResponse(BaseModel):
    status: str
    synced_accounts: Optional[int] = None
    reason: Optional[str] = None


class SymphonyExportConfig(BaseModel):
    local_path: str = ""


class AppConfigResponse(BaseModel):
    finnhub_api_key: Optional[str] = None
    finnhub_configured: bool
    polygon_configured: bool
    local_auth_token: str
    symphony_export: Optional[SymphonyExportConfig] = None
    screenshot: Optional[Dict[str, Any]] = None
    test_mode: bool
    composer_config_ok: bool
    composer_config_error: Optional[str] = None


class SaveSymphonyExportResponse(BaseModel):
    ok: bool
    local_path: str


class SaveSymphonyExportRequest(BaseModel):
    local_path: str


class OkResponse(BaseModel):
    ok: bool


class ScreenshotUploadResponse(BaseModel):
    ok: bool
    path: str


class SaveScreenshotConfigRequest(BaseModel):
    local_path: str
    enabled: bool = True
    account_id: str = ""
    chart_mode: str = ""
    period: str = ""
    custom_start: str = ""
    hide_portfolio_value: bool = False
    metrics: List[str] = []
    benchmarks: List[str] = []


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
    annualized_return_cum: float
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
    annualized_return: float
    annualized_return_cum: float
    time_weighted_return: float
    money_weighted_return: float
    money_weighted_return_period: float
    sharpe_ratio: float
    calmar_ratio: float
    sortino_ratio: float
    max_drawdown: float
    max_drawdown_date: Optional[str] = None
    current_drawdown: float
    win_rate: float
    num_wins: int
    num_losses: int
    avg_win_pct: float
    avg_loss_pct: float
    annualized_volatility: float
    best_day_pct: float
    best_day_date: Optional[str] = None
    worst_day_pct: float
    worst_day_date: Optional[str] = None
    profit_factor: float
    median_drawdown: float = 0.0
    longest_drawdown_days: int = 0
    median_drawdown_days: int = 0
    total_fees: float
    total_dividends: float
    last_updated: Optional[str] = None


# --- Holdings ---
class HoldingSnapshot(BaseModel):
    symbol: str
    quantity: float
    market_value: float = 0.0
    allocation_pct: Optional[float] = None


class HoldingsForDate(BaseModel):
    date: date
    holdings: List[HoldingSnapshot]


class PortfolioHoldingsResponse(BaseModel):
    date: Optional[str] = None
    holdings: List[HoldingSnapshot]


class HoldingsHistoryRow(BaseModel):
    date: str
    num_positions: int


# --- Transactions ---
class TransactionRow(BaseModel):
    date: date
    symbol: str
    action: str
    quantity: float
    price: float
    total_amount: float
    account_id: Optional[str] = None
    account_name: Optional[str] = None


class TransactionListResponse(BaseModel):
    total: int
    transactions: List[TransactionRow]


# --- Cash Flows ---
class CashFlowRow(BaseModel):
    date: date
    type: str
    amount: float
    description: str = ""
    account_id: Optional[str] = None
    account_name: Optional[str] = None


# --- Performance chart data ---
class PerformancePoint(BaseModel):
    date: date
    portfolio_value: float
    net_deposits: float
    cumulative_return_pct: float
    daily_return_pct: float
    time_weighted_return: float
    money_weighted_return: float
    current_drawdown: float


# --- Benchmark history ---
class BenchmarkHistoryPoint(BaseModel):
    date: str
    close: float
    return_pct: float
    drawdown_pct: float
    mwr_pct: float


class BenchmarkHistoryResponse(BaseModel):
    ticker: str
    data: List[BenchmarkHistoryPoint]


class SymphonyBenchmarkResponse(BaseModel):
    name: str
    ticker: str
    data: List[BenchmarkHistoryPoint]


# --- Symphony list/catalog ---
class SymphonyHoldingRow(BaseModel):
    ticker: str
    allocation: float
    value: float
    last_percent_change: float


class SymphonyListRow(BaseModel):
    id: str
    position_id: str
    account_id: str
    account_name: str
    name: str
    color: str
    value: float
    net_deposits: float
    cash: float
    total_return: float
    cumulative_return_pct: float
    simple_return: float
    time_weighted_return: float
    last_dollar_change: float
    last_percent_change: float
    sharpe_ratio: float
    max_drawdown: float
    annualized_return: float
    invested_since: str
    last_rebalance_on: Optional[str] = None
    next_rebalance_on: Optional[str] = None
    rebalance_frequency: str
    holdings: List[SymphonyHoldingRow]


class SymphonyCatalogRow(BaseModel):
    symphony_id: str
    name: str
    source: str


# --- Symphony summary/backtest ---
class SymphonySummary(BaseModel):
    symphony_id: str
    account_id: str
    period: str
    start_date: str
    end_date: str
    portfolio_value: float
    net_deposits: float
    total_return_dollars: float
    daily_return_pct: float
    cumulative_return_pct: float
    cagr: float
    annualized_return: float
    annualized_return_cum: float
    time_weighted_return: float
    money_weighted_return: float
    money_weighted_return_period: float
    sharpe_ratio: float
    calmar_ratio: float
    sortino_ratio: float
    max_drawdown: float
    current_drawdown: float
    win_rate: float
    num_wins: int
    num_losses: int
    annualized_volatility: float
    best_day_pct: float
    worst_day_pct: float
    profit_factor: float


class SymphonyBacktestResponse(BaseModel):
    stats: Dict[str, Any]
    dvm_capital: Dict[str, Any]
    tdvm_weights: Dict[str, Any]
    benchmarks: Dict[str, Any]
    summary_metrics: Dict[str, Any]
    first_day: int
    last_market_day: int
    cached_at: str
    last_semantic_update_at: str = ""


# --- Trade preview ---
class TradePreviewRow(BaseModel):
    symphony_id: str
    symphony_name: str
    account_id: str
    account_name: str
    ticker: str
    notional: float
    quantity: float
    prev_value: float
    prev_weight: float
    next_weight: float
    side: str


class SymphonyTradeRecommendation(BaseModel):
    ticker: str
    name: Optional[str] = None
    side: str
    share_change: float
    cash_change: float
    average_price: float
    prev_value: float
    prev_weight: float
    next_weight: float


class SymphonyTradePreviewResponse(BaseModel):
    symphony_id: str
    symphony_name: str
    rebalanced: bool
    next_rebalance_after: str
    symphony_value: float
    recommended_trades: List[SymphonyTradeRecommendation]
    markets_closed: Optional[bool] = None
