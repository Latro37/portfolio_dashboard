"""SQLAlchemy ORM models for all database tables."""

from sqlalchemy import Column, Integer, Float, Text, Date, DateTime, UniqueConstraint
from app.database import Base


class Account(Base):
    """Discovered Composer sub-accounts (auto-populated on startup)."""
    __tablename__ = "accounts"

    id = Column(Text, primary_key=True)  # Composer account_uuid
    credential_name = Column(Text, nullable=False)  # user label from accounts.json
    account_type = Column(Text, nullable=False)  # raw: INDIVIDUAL, IRA_ROTH, etc.
    display_name = Column(Text, nullable=False)  # friendly: "Primary — Stocks"
    status = Column(Text, nullable=False, default="UNKNOWN")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Text, nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    symbol = Column(Text, nullable=False, index=True)
    action = Column(Text, nullable=False)  # buy / sell
    quantity = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    total_amount = Column(Float, nullable=False)
    order_id = Column(Text, nullable=False)

    __table_args__ = (UniqueConstraint("account_id", "order_id", name="uq_tx_account_order"),)


class HoldingsHistory(Base):
    __tablename__ = "holdings_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Text, nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    symbol = Column(Text, nullable=False)
    quantity = Column(Float, nullable=False)

    __table_args__ = (UniqueConstraint("account_id", "date", "symbol", name="uq_holdings_acct_date_symbol"),)


class CashFlow(Base):
    __tablename__ = "cash_flows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Text, nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    type = Column(Text, nullable=False)  # deposit / withdrawal / fee_cat / fee_taf / dividend
    amount = Column(Float, nullable=False)  # signed
    description = Column(Text, default="")


class DailyPortfolio(Base):
    __tablename__ = "daily_portfolio"

    account_id = Column(Text, primary_key=True)
    date = Column(Date, primary_key=True)
    portfolio_value = Column(Float, nullable=False)
    cash_balance = Column(Float, default=0.0)
    net_deposits = Column(Float, default=0.0)
    total_fees = Column(Float, default=0.0)
    total_dividends = Column(Float, default=0.0)


class DailyMetrics(Base):
    __tablename__ = "daily_metrics"

    account_id = Column(Text, primary_key=True)
    date = Column(Date, primary_key=True)
    daily_return_pct = Column(Float, default=0.0)
    cumulative_return_pct = Column(Float, default=0.0)
    total_return_dollars = Column(Float, default=0.0)
    cagr = Column(Float, default=0.0)
    annualized_return = Column(Float, default=0.0)
    annualized_return_cum = Column(Float, default=0.0)
    time_weighted_return = Column(Float, default=0.0)
    money_weighted_return = Column(Float, default=0.0)
    money_weighted_return_period = Column(Float, default=0.0)
    win_rate = Column(Float, default=0.0)
    num_wins = Column(Integer, default=0)
    num_losses = Column(Integer, default=0)
    avg_win_pct = Column(Float, default=0.0)
    avg_loss_pct = Column(Float, default=0.0)
    max_drawdown = Column(Float, default=0.0)
    current_drawdown = Column(Float, default=0.0)
    sharpe_ratio = Column(Float, default=0.0)
    calmar_ratio = Column(Float, default=0.0)
    sortino_ratio = Column(Float, default=0.0)
    annualized_volatility = Column(Float, default=0.0)
    best_day_pct = Column(Float, default=0.0)
    worst_day_pct = Column(Float, default=0.0)
    profit_factor = Column(Float, default=0.0)


class BenchmarkData(Base):
    __tablename__ = "benchmark_data"

    date = Column(Date, primary_key=True)
    symbol = Column(Text, nullable=False, default="SPY")
    close = Column(Float, nullable=False)


class SymphonyDailyPortfolio(Base):
    """Daily portfolio values per symphony (atomic unit of performance)."""
    __tablename__ = "symphony_daily_portfolio"

    account_id = Column(Text, primary_key=True)
    symphony_id = Column(Text, primary_key=True)
    date = Column(Date, primary_key=True)
    portfolio_value = Column(Float, nullable=False)
    net_deposits = Column(Float, default=0.0)


class SymphonyDailyMetrics(Base):
    """Rolling daily metrics per symphony — same columns as DailyMetrics."""
    __tablename__ = "symphony_daily_metrics"

    account_id = Column(Text, primary_key=True)
    symphony_id = Column(Text, primary_key=True)
    date = Column(Date, primary_key=True)
    daily_return_pct = Column(Float, default=0.0)
    cumulative_return_pct = Column(Float, default=0.0)
    total_return_dollars = Column(Float, default=0.0)
    cagr = Column(Float, default=0.0)
    annualized_return = Column(Float, default=0.0)
    annualized_return_cum = Column(Float, default=0.0)
    time_weighted_return = Column(Float, default=0.0)
    money_weighted_return = Column(Float, default=0.0)
    money_weighted_return_period = Column(Float, default=0.0)
    win_rate = Column(Float, default=0.0)
    num_wins = Column(Integer, default=0)
    num_losses = Column(Integer, default=0)
    avg_win_pct = Column(Float, default=0.0)
    avg_loss_pct = Column(Float, default=0.0)
    max_drawdown = Column(Float, default=0.0)
    current_drawdown = Column(Float, default=0.0)
    sharpe_ratio = Column(Float, default=0.0)
    calmar_ratio = Column(Float, default=0.0)
    sortino_ratio = Column(Float, default=0.0)
    annualized_volatility = Column(Float, default=0.0)
    best_day_pct = Column(Float, default=0.0)
    worst_day_pct = Column(Float, default=0.0)
    profit_factor = Column(Float, default=0.0)


class SymphonyBacktestCache(Base):
    """Cached backtest results for symphonies to avoid repeated slow API calls."""
    __tablename__ = "symphony_backtest_cache"

    symphony_id = Column(Text, primary_key=True)
    account_id = Column(Text, nullable=False)
    cached_at = Column(DateTime, nullable=False)
    stats_json = Column(Text, nullable=False, default="{}")
    dvm_capital_json = Column(Text, nullable=False, default="{}")
    tdvm_weights_json = Column(Text, nullable=False, default="{}")
    benchmarks_json = Column(Text, nullable=False, default="{}")
    summary_metrics_json = Column(Text, nullable=False, default="{}")
    first_day = Column(Integer, default=0)
    last_market_day = Column(Integer, default=0)
    last_semantic_update_at = Column(Text, nullable=True)


class SymphonyAllocationHistory(Base):
    """Daily snapshot of symphony holdings (ticker + allocation %)."""
    __tablename__ = "symphony_allocation_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Text, nullable=False, index=True)
    symphony_id = Column(Text, nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    ticker = Column(Text, nullable=False)
    allocation_pct = Column(Float, nullable=False)  # 0-100
    value = Column(Float, default=0.0)

    __table_args__ = (
        UniqueConstraint("account_id", "symphony_id", "date", "ticker",
                         name="uq_sym_alloc_acct_sym_date_ticker"),
    )


class SymphonyCatalogEntry(Base):
    """Cached catalog of user symphonies (invested, watchlist, drafts) for name search."""
    __tablename__ = "symphony_catalog"

    symphony_id = Column(Text, primary_key=True)
    name = Column(Text, nullable=False)
    source = Column(Text, nullable=False, default="invested")  # invested / watchlist / draft
    credential_name = Column(Text, nullable=False)
    updated_at = Column(DateTime, nullable=False)


class SyncState(Base):
    __tablename__ = "sync_state"

    account_id = Column(Text, primary_key=True)
    key = Column(Text, primary_key=True)
    value = Column(Text, nullable=False)
