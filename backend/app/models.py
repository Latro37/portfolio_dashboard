"""SQLAlchemy ORM models for all database tables."""

from sqlalchemy import Column, Integer, Float, Text, Date, UniqueConstraint
from app.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, index=True)
    symbol = Column(Text, nullable=False, index=True)
    action = Column(Text, nullable=False)  # buy / sell
    quantity = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    total_amount = Column(Float, nullable=False)
    order_id = Column(Text, unique=True, nullable=False)


class HoldingsHistory(Base):
    __tablename__ = "holdings_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, index=True)
    symbol = Column(Text, nullable=False)
    quantity = Column(Float, nullable=False)

    __table_args__ = (UniqueConstraint("date", "symbol", name="uq_holdings_date_symbol"),)


class CashFlow(Base):
    __tablename__ = "cash_flows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, index=True)
    type = Column(Text, nullable=False)  # deposit / withdrawal / fee_cat / fee_taf / dividend
    amount = Column(Float, nullable=False)  # signed
    description = Column(Text, default="")


class DailyPortfolio(Base):
    __tablename__ = "daily_portfolio"

    date = Column(Date, primary_key=True)
    portfolio_value = Column(Float, nullable=False)
    cash_balance = Column(Float, default=0.0)
    net_deposits = Column(Float, default=0.0)
    total_fees = Column(Float, default=0.0)
    total_dividends = Column(Float, default=0.0)


class DailyMetrics(Base):
    __tablename__ = "daily_metrics"

    date = Column(Date, primary_key=True)
    daily_return_pct = Column(Float, default=0.0)
    cumulative_return_pct = Column(Float, default=0.0)
    total_return_dollars = Column(Float, default=0.0)
    cagr = Column(Float, default=0.0)
    annualized_return = Column(Float, default=0.0)
    time_weighted_return = Column(Float, default=0.0)
    money_weighted_return = Column(Float, default=0.0)
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


class SyncState(Base):
    __tablename__ = "sync_state"

    key = Column(Text, primary_key=True)
    value = Column(Text, nullable=False)
