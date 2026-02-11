"""Sync service: backfill and incremental update from Composer API to local DB."""

import logging
import time
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.composer_client import ComposerClient
from app.models import (
    Transaction, HoldingsHistory, CashFlow, DailyPortfolio,
    DailyMetrics, BenchmarkData, SyncState, SymphonyAllocationHistory,
    SymphonyDailyPortfolio, SymphonyDailyMetrics,
)
from app.services.holdings import reconstruct_holdings
from app.services.metrics import compute_all_metrics, compute_latest_metrics
from app.config import get_settings
from app.market_hours import is_after_close, get_allocation_target_date

logger = logging.getLogger(__name__)

# Map Composer non-trade type codes to our DB types
_CASH_FLOW_TYPE_MAP = {
    ("CSD", ""): "deposit",
    ("CSW", ""): "withdrawal",
    ("FEE", "CAT"): "fee_cat",
    ("FEE", "TAF"): "fee_taf",
    ("DIV", ""): "dividend",
}


def _map_cash_flow_type(type_code: str, subtype: str) -> Optional[str]:
    """Map Composer type/subtype to our simplified type string."""
    # Try exact match first
    key = (type_code, subtype)
    if key in _CASH_FLOW_TYPE_MAP:
        return _CASH_FLOW_TYPE_MAP[key]
    # Try with empty subtype
    key = (type_code, "")
    if key in _CASH_FLOW_TYPE_MAP:
        return _CASH_FLOW_TYPE_MAP[key]
    # Special cases
    if type_code == "CSD":
        return "deposit"
    if type_code == "CSW":
        return "withdrawal"
    if type_code == "FEE":
        return f"fee_{subtype.lower()}" if subtype else "fee"
    if type_code == "DIV":
        return "dividend"
    return None


def get_sync_state(db: Session, account_id: str) -> dict:
    """Read sync state from DB for a specific sub-account."""
    rows = db.query(SyncState).filter_by(account_id=account_id).all()
    return {r.key: r.value for r in rows}


def set_sync_state(db: Session, account_id: str, key: str, value: str):
    existing = db.query(SyncState).filter_by(account_id=account_id, key=key).first()
    if existing:
        existing.value = value
    else:
        db.add(SyncState(account_id=account_id, key=key, value=value))
    db.commit()


def _safe_step(label: str, fn, *args, **kwargs):
    """Run a sync step, logging and continuing on failure."""
    try:
        fn(*args, **kwargs)
    except Exception as e:
        logger.warning("Sync step '%s' failed (continuing): %s", label, e)


def full_backfill(db: Session, client: ComposerClient, account_id: str):
    """One-time full backfill of all historical data for a sub-account."""
    logger.info("Starting full backfill for account %s...", account_id)

    # 1. Sync transactions
    _safe_step("transactions", _sync_transactions, db, client, account_id, since="2020-01-01")

    # 2. Sync cash flows (deposits, fees, dividends)
    _safe_step("cash_flows", _sync_cash_flows, db, client, account_id, since="2020-01-01")

    # 3. Sync portfolio history (daily values)
    _safe_step("portfolio_history", _sync_portfolio_history, db, client, account_id)

    # 4. Reconstruct and store holdings history
    _safe_step("holdings_history", _sync_holdings_history, db, client, account_id)

    # 5. Fetch benchmark data
    _safe_step("benchmark", _sync_benchmark, db, account_id)

    # 6. Compute and store all metrics
    _safe_step("metrics", _recompute_metrics, db, account_id)

    # 7. Snapshot symphony allocations
    _safe_step("symphony_allocations", _sync_symphony_allocations, db, client, account_id)

    # 8. Sync symphony daily data (full history) and compute symphony metrics
    _safe_step("symphony_daily", _sync_symphony_daily_backfill, db, client, account_id)
    _safe_step("symphony_metrics", _recompute_symphony_metrics, db, account_id)

    set_sync_state(db, account_id, "initial_backfill_done", "true")
    set_sync_state(db, account_id, "last_sync_date", datetime.now().strftime("%Y-%m-%d"))
    logger.info("Full backfill complete for account %s", account_id)


def incremental_update(db: Session, client: ComposerClient, account_id: str):
    """Update data from the last sync date to today for a sub-account."""
    state = get_sync_state(db, account_id)
    last_date = state.get("last_sync_date")
    if not last_date:
        logger.info("No last sync date found for %s — running full backfill instead", account_id)
        full_backfill(db, client, account_id)
        return

    logger.info("Incremental update for %s from %s", account_id, last_date)

    # Sync new data from last_date
    _safe_step("transactions", _sync_transactions, db, client, account_id, since=last_date)
    _safe_step("cash_flows", _sync_cash_flows, db, client, account_id, since=last_date)
    _safe_step("portfolio_history", _sync_portfolio_history, db, client, account_id)
    _safe_step("holdings_history", _sync_holdings_history, db, client, account_id)
    _safe_step("benchmark", _sync_benchmark, db, account_id)
    _safe_step("metrics", _recompute_metrics, db, account_id)
    _safe_step("symphony_allocations", _sync_symphony_allocations, db, client, account_id)

    # Sync symphony daily data (incremental: today only) and compute symphony metrics
    _safe_step("symphony_daily", _sync_symphony_daily_incremental, db, client, account_id)
    _safe_step("symphony_metrics", _recompute_symphony_metrics, db, account_id)

    set_sync_state(db, account_id, "last_sync_date", datetime.now().strftime("%Y-%m-%d"))
    logger.info("Incremental update complete for %s", account_id)


# ------------------------------------------------------------------
# Internal sync helpers
# ------------------------------------------------------------------

def _sync_transactions(db: Session, client: ComposerClient, account_id: str, since: str):
    """Fetch trade activity and upsert into transactions table."""
    trades = client.get_trade_activity(account_id, since=since)
    new_count = 0
    for t in trades:
        order_id = t.get("order_id", "")
        if not order_id:
            continue
        exists = db.query(Transaction).filter_by(account_id=account_id, order_id=order_id).first()
        if exists:
            continue
        # Parse date
        raw_date = t.get("date", "")
        try:
            if len(raw_date) == 10:
                tx_date = date.fromisoformat(raw_date)
            else:
                tx_date = datetime.strptime(raw_date.split(".")[0].replace("T", " "), "%Y-%m-%d %H:%M:%S").date()
        except Exception:
            continue

        db.add(Transaction(
            account_id=account_id,
            date=tx_date,
            symbol=t["symbol"],
            action=t["action"],
            quantity=t["quantity"],
            price=t["price"],
            total_amount=t["total_amount"],
            order_id=order_id,
        ))
        new_count += 1

    db.commit()
    logger.info("Transactions synced for %s: %d new", account_id, new_count)


def _sync_cash_flows(db: Session, client: ComposerClient, account_id: str, since: str):
    """Fetch non-trade activity and upsert into cash_flows table."""
    rows = client.get_non_trade_activity(account_id, since=since)

    # Build set of existing (date, type, amount) for dedup
    existing = set()
    for cf in db.query(CashFlow).filter_by(account_id=account_id).all():
        existing.add((str(cf.date), cf.type, round(cf.amount, 4)))

    new_count = 0
    for r in rows:
        mapped_type = _map_cash_flow_type(r["type"], r.get("subtype", ""))
        if mapped_type is None:
            continue
        try:
            cf_date = date.fromisoformat(r["date"])
        except Exception:
            continue

        key = (r["date"], mapped_type, round(r["amount"], 4))
        if key in existing:
            continue

        db.add(CashFlow(
            account_id=account_id,
            date=cf_date,
            type=mapped_type,
            amount=r["amount"],
            description=r.get("description", ""),
        ))
        existing.add(key)
        new_count += 1

    db.commit()
    logger.info("Cash flows synced for %s: %d new", account_id, new_count)


def _sync_portfolio_history(db: Session, client: ComposerClient, account_id: str):
    """Fetch portfolio history and upsert into daily_portfolio table."""
    history = client.get_portfolio_history(account_id)

    # Load cash flows for cumulative calculations
    all_cf = db.query(CashFlow).filter_by(account_id=account_id).order_by(CashFlow.date).all()

    # Build cumulative deposit/fee/dividend by date
    cum_deposits = 0.0
    cum_fees = 0.0
    cum_dividends = 0.0
    cum_by_date = {}

    cf_by_date = {}
    for cf in all_cf:
        ds = str(cf.date)
        cf_by_date.setdefault(ds, []).append(cf)

    all_dates_sorted = sorted(cf_by_date.keys())
    for ds in all_dates_sorted:
        for cf in cf_by_date[ds]:
            if cf.type == "deposit":
                cum_deposits += cf.amount
            elif cf.type == "withdrawal":
                cum_deposits += cf.amount  # negative
            elif cf.type.startswith("fee"):
                cum_fees += cf.amount  # negative
                # CAT fees reduce net deposits
                if cf.type == "fee_cat":
                    cum_deposits += cf.amount
            elif cf.type == "dividend":
                cum_dividends += cf.amount
        cum_by_date[ds] = {
            "net_deposits": round(cum_deposits, 2),
            "total_fees": round(cum_fees, 2),
            "total_dividends": round(cum_dividends, 2),
        }

    # If no cash flows found, fall back to total-stats API for net_deposits
    if not all_cf:
        try:
            total_stats = client.get_total_stats(account_id)
            fallback_deposits = float(total_stats.get("net_deposits", 0))
            logger.info(
                "No cash flow data for %s — using total-stats net_deposits=%.2f as fallback",
                account_id, fallback_deposits,
            )
        except Exception:
            fallback_deposits = 0.0
    else:
        fallback_deposits = None

    # Forward-fill cumulative values for dates without cash flow events
    last_cum = {"net_deposits": 0.0, "total_fees": 0.0, "total_dividends": 0.0}

    # Try to get current cash balance
    try:
        cash_balance = client.get_cash_balance(account_id)
    except Exception:
        cash_balance = 0.0

    new_count = 0
    for entry in history:
        ds = entry["date"]
        try:
            d = date.fromisoformat(ds)
        except Exception:
            continue

        # Get cumulative values
        if ds in cum_by_date:
            last_cum = cum_by_date[ds]

        # Use fallback deposits if no cash flow data exists
        deposits_val = fallback_deposits if fallback_deposits is not None else last_cum["net_deposits"]
        fees_val = last_cum["total_fees"]
        dividends_val = last_cum["total_dividends"]

        existing = db.query(DailyPortfolio).filter_by(account_id=account_id, date=d).first()
        if existing:
            existing.portfolio_value = entry["portfolio_value"]
            existing.net_deposits = deposits_val
            existing.total_fees = fees_val
            existing.total_dividends = dividends_val
            # Only set cash_balance for today
            if ds == datetime.now().strftime("%Y-%m-%d"):
                existing.cash_balance = cash_balance
        else:
            db.add(DailyPortfolio(
                account_id=account_id,
                date=d,
                portfolio_value=entry["portfolio_value"],
                cash_balance=cash_balance if ds == datetime.now().strftime("%Y-%m-%d") else 0.0,
                net_deposits=deposits_val,
                total_fees=fees_val,
                total_dividends=dividends_val,
            ))
            new_count += 1

    db.commit()
    logger.info("Daily portfolio synced for %s: %d new rows", account_id, new_count)


def _sync_holdings_history(db: Session, client: ComposerClient, account_id: str):
    """Reconstruct holdings from transactions and store snapshots."""
    # Get all transactions from DB for this account
    txs = db.query(Transaction).filter_by(account_id=account_id).order_by(Transaction.date).all()
    tx_dicts = [
        {"date": str(t.date), "symbol": t.symbol, "action": t.action, "quantity": t.quantity}
        for t in txs
    ]

    if not tx_dicts:
        return

    snapshots = reconstruct_holdings(tx_dicts)

    new_count = 0
    for snap in snapshots:
        d = date.fromisoformat(snap["date"])
        # Delete existing entries for this account+date and re-insert
        db.query(HoldingsHistory).filter_by(account_id=account_id, date=d).delete()
        for sym, qty in snap["holdings"].items():
            db.add(HoldingsHistory(account_id=account_id, date=d, symbol=sym, quantity=qty))
            new_count += 1

    db.commit()
    logger.info("Holdings history synced for %s: %d rows across %d dates", account_id, new_count, len(snapshots))


def _sync_benchmark(db: Session, account_id: str):
    """Fetch SPY daily closes from yfinance and store."""
    import yfinance as yf
    settings = get_settings()
    ticker = settings.benchmark_ticker

    # Find date range from daily_portfolio for this account
    first = db.query(func.min(DailyPortfolio.date)).filter(
        DailyPortfolio.account_id == account_id
    ).scalar()
    if not first:
        return

    try:
        data = yf.download(ticker, start=str(first), progress=False)
        if data.empty:
            return
    except Exception as e:
        logger.warning("Failed to fetch benchmark data: %s", e)
        return

    new_count = 0
    for idx, row in data.iterrows():
        d = idx.date() if hasattr(idx, "date") else idx
        close_val = float(row["Close"].iloc[0]) if hasattr(row["Close"], "iloc") else float(row["Close"])
        existing = db.query(BenchmarkData).filter_by(date=d).first()
        if existing:
            existing.close = close_val
        else:
            db.add(BenchmarkData(date=d, symbol=ticker, close=close_val))
            new_count += 1

    db.commit()
    logger.info("Benchmark data synced: %d new rows", new_count)


def _recompute_metrics(db: Session, account_id: str):
    """Recompute all daily metrics from stored data for a sub-account."""
    # Load daily portfolio for this account
    portfolio_rows = db.query(DailyPortfolio).filter_by(
        account_id=account_id
    ).order_by(DailyPortfolio.date).all()
    if not portfolio_rows:
        return

    daily_dicts = [
        {"date": r.date, "portfolio_value": r.portfolio_value, "net_deposits": r.net_deposits}
        for r in portfolio_rows
    ]

    # Load external cash flows (deposits + withdrawals only for MWR)
    ext_flows = db.query(CashFlow).filter(
        CashFlow.account_id == account_id,
        CashFlow.type.in_(["deposit", "withdrawal"]),
    ).order_by(CashFlow.date).all()
    cf_dicts = [{"date": cf.date, "amount": cf.amount} for cf in ext_flows]

    # Load benchmark
    bench_rows = db.query(BenchmarkData).order_by(BenchmarkData.date).all()
    bench_dicts = [{"date": r.date, "close": r.close} for r in bench_rows] if bench_rows else None

    settings = get_settings()
    metrics = compute_all_metrics(daily_dicts, cf_dicts, bench_dicts, settings.risk_free_rate)

    # Upsert metrics (filter keys to valid model columns to avoid schema mismatch crashes)
    _dm_cols = {c.key for c in DailyMetrics.__table__.columns} - {"account_id"}
    for m in metrics:
        d = m["date"]
        filtered = {k: v for k, v in m.items() if k in _dm_cols}
        existing = db.query(DailyMetrics).filter_by(account_id=account_id, date=d).first()
        if existing:
            for k, v in filtered.items():
                if k != "date":
                    setattr(existing, k, v)
        else:
            db.add(DailyMetrics(account_id=account_id, **filtered))

    db.commit()
    logger.info("Metrics recomputed for %s: %d rows", account_id, len(metrics))


def _sync_symphony_allocations(db: Session, client: ComposerClient, account_id: str):
    """Snapshot current symphony holdings mapped to the next trading day.

    Only runs after market close (4:00 PM ET) through before market open
    (9:30 AM ET).  Date logic:
      - 4:00 PM – midnight ET  → target date = next calendar day
      - midnight – 9:30 AM ET  → target date = today
      - Weekends / during market hours → skip
    """
    target = get_allocation_target_date()
    if target is None:
        logger.info("Skipping symphony allocation snapshot during market hours for %s", account_id)
        return

    if not is_after_close():
        logger.info("Skipping symphony allocation snapshot — not in post-close window for %s", account_id)
        return

    # Check if we already have a snapshot for the target date
    existing = db.query(SymphonyAllocationHistory).filter_by(
        account_id=account_id, date=target
    ).first()
    if existing:
        logger.info("Symphony allocations already captured for %s on %s", account_id, target)
        return

    try:
        symphonies = client.get_symphony_stats(account_id)
    except Exception as e:
        logger.warning("Failed to fetch symphony stats for %s: %s", account_id, e)
        return

    new_count = 0
    for s in symphonies:
        sym_id = s.get("id", "")
        if not sym_id:
            continue
        for h in s.get("holdings", []):
            ticker = h.get("ticker", "")
            if not ticker:
                continue
            db.add(SymphonyAllocationHistory(
                account_id=account_id,
                symphony_id=sym_id,
                date=target,
                ticker=ticker,
                allocation_pct=round(h.get("allocation", 0) * 100, 2),
                value=round(h.get("value", 0), 2),
            ))
            new_count += 1

    db.commit()
    logger.info("Symphony allocations captured for %s (target date %s): %d holdings across %d symphonies",
                account_id, target, new_count, len(symphonies))


# ------------------------------------------------------------------
# Symphony daily data (backfill + incremental)
# ------------------------------------------------------------------

def _infer_net_deposits_from_history(history: list) -> list[float]:
    """Infer cumulative net deposits per day from symphony history.

    Uses the deposit_adjusted_value vs value series to detect cash flows.
    Logic: deposit_adjusted only moves with market returns, so any
    difference between expected and actual value indicates a cash flow.
    """
    if not history:
        return []

    initial_val = history[0]["value"]
    cum_net_dep = initial_val
    net_deposits = [cum_net_dep]

    for i in range(1, len(history)):
        prev_val = history[i - 1]["value"]
        prev_adj = history[i - 1]["deposit_adjusted_value"]
        adj_i = history[i]["deposit_adjusted_value"]
        val_i = history[i]["value"]

        mkt_ret = (adj_i / prev_adj) if prev_adj > 0 else 1.0
        expected_val = prev_val * mkt_ret
        cf = val_i - expected_val
        if abs(cf) > 0.50:  # real cash flow (ignore float noise)
            cum_net_dep += cf
        net_deposits.append(cum_net_dep)

    return net_deposits


def _sync_symphony_daily_backfill(db: Session, client: ComposerClient, account_id: str):
    """Fetch full daily history for each active symphony and store all rows."""
    try:
        symphonies = client.get_symphony_stats(account_id)
    except Exception as e:
        logger.warning("Failed to fetch symphony stats for backfill %s: %s", account_id, e)
        return

    total_new = 0
    for s in symphonies:
        sym_id = s.get("id", "")
        if not sym_id:
            continue

        try:
            history = client.get_symphony_history(account_id, sym_id)
        except Exception as e:
            logger.warning("Failed to fetch history for symphony %s: %s", sym_id, e)
            continue

        if not history:
            continue

        net_deps = _infer_net_deposits_from_history(history)

        for i, pt in enumerate(history):
            try:
                d = date.fromisoformat(pt["date"])
            except Exception:
                continue

            existing = db.query(SymphonyDailyPortfolio).filter_by(
                account_id=account_id, symphony_id=sym_id, date=d
            ).first()
            if existing:
                existing.portfolio_value = pt["value"]
                existing.net_deposits = round(net_deps[i], 2)
            else:
                db.add(SymphonyDailyPortfolio(
                    account_id=account_id,
                    symphony_id=sym_id,
                    date=d,
                    portfolio_value=pt["value"],
                    net_deposits=round(net_deps[i], 2),
                ))
                total_new += 1

        time.sleep(0.5)  # rate-limit between symphony history calls

    db.commit()
    logger.info("Symphony daily backfill for %s: %d new rows across %d symphonies",
                account_id, total_new, len(symphonies))


def _sync_symphony_daily_incremental(db: Session, client: ComposerClient, account_id: str):
    """Store today's symphony values using symphony-stats-meta (1 API call)."""
    today = date.today()
    if today.weekday() >= 5:
        logger.info("Skipping symphony daily on weekend for %s", account_id)
        return

    try:
        symphonies = client.get_symphony_stats(account_id)
    except Exception as e:
        logger.warning("Failed to fetch symphony stats for incremental %s: %s", account_id, e)
        return

    new_count = 0
    for s in symphonies:
        sym_id = s.get("id", "")
        if not sym_id:
            continue

        value = s.get("value", 0)
        net_dep = s.get("net_deposits", 0)

        existing = db.query(SymphonyDailyPortfolio).filter_by(
            account_id=account_id, symphony_id=sym_id, date=today
        ).first()
        if existing:
            existing.portfolio_value = round(value, 2)
            existing.net_deposits = round(net_dep, 2)
        else:
            db.add(SymphonyDailyPortfolio(
                account_id=account_id,
                symphony_id=sym_id,
                date=today,
                portfolio_value=round(value, 2),
                net_deposits=round(net_dep, 2),
            ))
            new_count += 1

    db.commit()
    logger.info("Symphony daily incremental for %s: %d new rows for %d symphonies",
                account_id, new_count, len(symphonies))


def _recompute_symphony_metrics(db: Session, account_id: str):
    """Compute daily metrics for each symphony from stored SymphonyDailyPortfolio data.

    Uses incremental computation when possible: if metrics already exist for all
    days except the latest, only the latest day is computed (one IRR solve instead
    of N).  Falls back to full backfill when metrics are missing for earlier days.
    """
    # Get distinct symphony IDs for this account
    sym_ids = [
        row[0] for row in
        db.query(SymphonyDailyPortfolio.symphony_id).filter_by(
            account_id=account_id
        ).distinct().all()
    ]

    settings = get_settings()

    for sym_id in sym_ids:
        portfolio_rows = db.query(SymphonyDailyPortfolio).filter_by(
            account_id=account_id, symphony_id=sym_id,
        ).order_by(SymphonyDailyPortfolio.date).all()

        if not portfolio_rows:
            continue

        daily_dicts = [
            {"date": r.date, "portfolio_value": r.portfolio_value, "net_deposits": r.net_deposits}
            for r in portfolio_rows
        ]

        # Infer cash flow events from net_deposits changes for MWR
        cf_dicts = []
        for j in range(1, len(portfolio_rows)):
            delta = portfolio_rows[j].net_deposits - portfolio_rows[j - 1].net_deposits
            if abs(delta) > 0.50:
                cf_dicts.append({"date": portfolio_rows[j].date, "amount": delta})

        # Check if we can do incremental (metrics exist for all days except the last)
        last_metric_date = db.query(func.max(SymphonyDailyMetrics.date)).filter_by(
            account_id=account_id, symphony_id=sym_id,
        ).scalar()

        latest_portfolio_date = portfolio_rows[-1].date
        second_latest_date = portfolio_rows[-2].date if len(portfolio_rows) >= 2 else None

        use_incremental = (
            last_metric_date is not None
            and second_latest_date is not None
            and last_metric_date >= second_latest_date
            and last_metric_date < latest_portfolio_date
        )

        if use_incremental:
            # Incremental: compute only the latest day's metrics
            m = compute_latest_metrics(daily_dicts, cf_dicts, settings.risk_free_rate)
            if m:
                metrics_to_persist = [m]
                logger.debug("Incremental metrics for symphony %s: 1 new day", sym_id)
        else:
            # Full backfill: compute all days
            metrics_to_persist = compute_all_metrics(daily_dicts, cf_dicts, None, settings.risk_free_rate)
            logger.debug("Full backfill metrics for symphony %s: %d days", sym_id, len(metrics_to_persist))

        # Persist (upsert — filter keys to valid model columns)
        _sdm_cols = {c.key for c in SymphonyDailyMetrics.__table__.columns} - {"account_id", "symphony_id"}
        for m in metrics_to_persist:
            d = m["date"]
            filtered = {k: v for k, v in m.items() if k in _sdm_cols}
            existing = db.query(SymphonyDailyMetrics).filter_by(
                account_id=account_id, symphony_id=sym_id, date=d
            ).first()
            if existing:
                for k, v in filtered.items():
                    if k != "date":
                        setattr(existing, k, v)
            else:
                db.add(SymphonyDailyMetrics(
                    account_id=account_id, symphony_id=sym_id, **filtered
                ))

    db.commit()
    logger.info("Symphony metrics computed for %s: %d symphonies", account_id, len(sym_ids))
