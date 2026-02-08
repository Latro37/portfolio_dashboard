"""Portfolio API routes."""

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    DailyPortfolio, DailyMetrics, HoldingsHistory, Transaction, CashFlow, SyncState,
)
from app.schemas import (
    PortfolioSummary, DailyPortfolioRow, DailyMetricsRow,
    HoldingsForDate, HoldingSnapshot, TransactionRow, CashFlowRow,
    PerformancePoint, SyncStatus,
)
from app.services.sync import full_backfill, incremental_update, get_sync_state, set_sync_state
from app.composer_client import ComposerClient

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["portfolio"])

# Simple in-memory sync lock
_syncing = False


@router.get("/summary", response_model=PortfolioSummary)
def get_summary(db: Session = Depends(get_db)):
    """Current portfolio summary with latest metrics."""
    latest_portfolio = db.query(DailyPortfolio).order_by(DailyPortfolio.date.desc()).first()
    latest_metrics = db.query(DailyMetrics).order_by(DailyMetrics.date.desc()).first()

    if not latest_portfolio:
        raise HTTPException(404, "No portfolio data. Run sync first.")

    state = get_sync_state(db)

    m = latest_metrics
    return PortfolioSummary(
        portfolio_value=latest_portfolio.portfolio_value,
        net_deposits=latest_portfolio.net_deposits,
        total_return_dollars=m.total_return_dollars if m else 0,
        daily_return_pct=m.daily_return_pct if m else 0,
        cumulative_return_pct=m.cumulative_return_pct if m else 0,
        cagr=m.cagr if m else 0,
        time_weighted_return=m.time_weighted_return if m else 0,
        money_weighted_return=m.money_weighted_return if m else 0,
        sharpe_ratio=m.sharpe_ratio if m else 0,
        calmar_ratio=m.calmar_ratio if m else 0,
        sortino_ratio=m.sortino_ratio if m else 0,
        max_drawdown=m.max_drawdown if m else 0,
        current_drawdown=m.current_drawdown if m else 0,
        win_rate=m.win_rate if m else 0,
        num_wins=m.num_wins if m else 0,
        num_losses=m.num_losses if m else 0,
        avg_win_pct=m.avg_win_pct if m else 0,
        avg_loss_pct=m.avg_loss_pct if m else 0,
        annualized_volatility=m.annualized_volatility if m else 0,
        best_day_pct=m.best_day_pct if m else 0,
        worst_day_pct=m.worst_day_pct if m else 0,
        profit_factor=m.profit_factor if m else 0,
        total_fees=latest_portfolio.total_fees,
        total_dividends=latest_portfolio.total_dividends,
        last_updated=state.get("last_sync_date"),
    )


@router.get("/performance")
def get_performance(
    period: Optional[str] = Query(None, description="1D,1W,1M,3M,YTD,1Y,ALL"),
    db: Session = Depends(get_db),
):
    """Performance chart data (portfolio value + deposits + returns over time)."""
    query = db.query(DailyPortfolio, DailyMetrics).outerjoin(
        DailyMetrics, DailyPortfolio.date == DailyMetrics.date
    ).order_by(DailyPortfolio.date)

    # Apply period filter
    if period:
        from datetime import timedelta
        today = date.today()
        if period == "1D":
            start = today - timedelta(days=1)
        elif period == "1W":
            start = today - timedelta(weeks=1)
        elif period == "1M":
            start = today - timedelta(days=30)
        elif period == "3M":
            start = today - timedelta(days=90)
        elif period == "YTD":
            start = date(today.year, 1, 1)
        elif period == "1Y":
            start = today - timedelta(days=365)
        else:
            start = None

        if start:
            query = query.filter(DailyPortfolio.date >= start)

    results = query.all()
    return [
        {
            "date": str(p.date),
            "portfolio_value": p.portfolio_value,
            "net_deposits": p.net_deposits,
            "cumulative_return_pct": m.cumulative_return_pct if m else 0,
            "daily_return_pct": m.daily_return_pct if m else 0,
        }
        for p, m in results
    ]


@router.get("/metrics")
def get_metrics(db: Session = Depends(get_db)):
    """All daily metrics."""
    rows = db.query(DailyMetrics).order_by(DailyMetrics.date).all()
    return [
        {c.name: getattr(r, c.name) for c in DailyMetrics.__table__.columns}
        for r in rows
    ]


@router.get("/holdings")
def get_holdings(
    target_date: Optional[str] = Query(None, alias="date", description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Holdings for a specific date (defaults to latest)."""
    if target_date:
        d = date.fromisoformat(target_date)
        # Find closest date on or before
        rows = db.query(HoldingsHistory).filter(
            HoldingsHistory.date <= d
        ).order_by(HoldingsHistory.date.desc()).all()
        # Get the most recent date from results
        if rows:
            latest_date = rows[0].date
            rows = [r for r in rows if r.date == latest_date]
        else:
            return {"date": target_date, "holdings": []}
    else:
        # Latest date
        latest_date = db.query(HoldingsHistory.date).order_by(
            HoldingsHistory.date.desc()
        ).first()
        if not latest_date:
            return {"date": None, "holdings": []}
        latest_date = latest_date[0]
        rows = db.query(HoldingsHistory).filter_by(date=latest_date).all()

    total_qty = sum(abs(r.quantity) for r in rows)
    holdings = []
    for r in rows:
        holdings.append({
            "symbol": r.symbol,
            "quantity": r.quantity,
            "allocation_pct": round(abs(r.quantity) / total_qty * 100, 2) if total_qty > 0 else 0,
        })

    return {"date": str(latest_date), "holdings": holdings}


@router.get("/holdings-history")
def get_holdings_history(db: Session = Depends(get_db)):
    """All holdings history dates with position counts."""
    from sqlalchemy import func
    rows = db.query(
        HoldingsHistory.date,
        func.count(HoldingsHistory.symbol).label("num_positions"),
    ).group_by(HoldingsHistory.date).order_by(HoldingsHistory.date).all()
    return [{"date": str(r.date), "num_positions": r.num_positions} for r in rows]


@router.get("/transactions")
def get_transactions(
    symbol: Optional[str] = None,
    limit: int = Query(100, le=5000),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Transaction history with optional symbol filter."""
    query = db.query(Transaction).order_by(Transaction.date.desc())
    if symbol:
        query = query.filter(Transaction.symbol == symbol.upper())
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    return {
        "total": total,
        "transactions": [
            {
                "date": str(r.date),
                "symbol": r.symbol,
                "action": r.action,
                "quantity": r.quantity,
                "price": r.price,
                "total_amount": r.total_amount,
            }
            for r in rows
        ],
    }


@router.get("/cash-flows")
def get_cash_flows(db: Session = Depends(get_db)):
    """All deposits, fees, and dividends."""
    rows = db.query(CashFlow).order_by(CashFlow.date).all()
    return [
        {
            "date": str(r.date),
            "type": r.type,
            "amount": r.amount,
            "description": r.description,
        }
        for r in rows
    ]


@router.get("/sync/status", response_model=SyncStatus)
def get_sync_status(db: Session = Depends(get_db)):
    """Current sync status."""
    state = get_sync_state(db)
    return SyncStatus(
        status="syncing" if _syncing else "idle",
        last_sync_date=state.get("last_sync_date"),
        initial_backfill_done=state.get("initial_backfill_done") == "true",
        message="",
    )


@router.post("/sync")
def trigger_sync(db: Session = Depends(get_db)):
    """Trigger data sync. Runs backfill on first call, incremental after."""
    global _syncing
    if _syncing:
        return {"status": "already_syncing"}

    _syncing = True
    try:
        state = get_sync_state(db)
        client = ComposerClient()

        if state.get("initial_backfill_done") == "true":
            incremental_update(db, client)
        else:
            full_backfill(db, client)

        return {"status": "complete", "last_sync_date": get_sync_state(db).get("last_sync_date")}
    except Exception as e:
        logger.error("Sync failed: %s", e, exc_info=True)
        raise HTTPException(500, f"Sync failed: {e}")
    finally:
        _syncing = False
