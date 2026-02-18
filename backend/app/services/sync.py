"""Sync service: backfill and incremental update from Composer API to local DB."""

import logging
import time
from datetime import date, datetime, timedelta
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
from app.services.finnhub_market_data import (
    FinnhubAccessError,
    FinnhubError,
    get_daily_closes,
    get_daily_closes_stooq,
)
from app.services.metrics import compute_all_metrics, compute_latest_metrics
from app.config import get_settings
from app.market_hours import is_after_close, get_allocation_target_date

logger = logging.getLogger(__name__)
_INITIAL_SYNC_STEP_RETRIES = 2
_INITIAL_SYNC_STEP_RETRY_DELAY_SECONDS = 2.0

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


def _safe_step(
    label: str,
    fn,
    *args,
    retries: int = 0,
    retry_delay_seconds: float = 0.0,
    raise_on_failure: bool = False,
    **kwargs,
):
    """Run a sync step with optional retries.

    Returns True on success. When `raise_on_failure` is False, returns False
    after final failure and allows the caller to continue.
    """
    max_attempts = max(1, int(retries) + 1)
    for attempt in range(1, max_attempts + 1):
        try:
            fn(*args, **kwargs)
            return True
        except Exception as e:
            if attempt < max_attempts:
                logger.warning(
                    "Sync step '%s' failed on attempt %d/%d: %s. Retrying in %.1fs...",
                    label,
                    attempt,
                    max_attempts,
                    e,
                    retry_delay_seconds,
                )
                if retry_delay_seconds > 0:
                    time.sleep(retry_delay_seconds)
                continue

            if raise_on_failure:
                logger.error(
                    "Sync step '%s' failed after %d attempts: %s",
                    label,
                    max_attempts,
                    e,
                )
                raise

            logger.warning(
                "Sync step '%s' failed after %d attempts (continuing): %s",
                label,
                max_attempts,
                e,
            )
            return False

    return False


def _refresh_symphony_catalog_safe(db: Session):
    """Wrapper to refresh the symphony catalog during sync (lazy import to avoid circular deps)."""
    from app.services.symphony_catalog import _refresh_symphony_catalog
    _refresh_symphony_catalog(db)


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

    # 9. Refresh symphony catalog (for name search)
    _safe_step("symphony_catalog", _refresh_symphony_catalog_safe, db)

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

    # Refresh symphony catalog (for name search)
    _safe_step("symphony_catalog", _refresh_symphony_catalog_safe, db)

    set_sync_state(db, account_id, "last_sync_date", datetime.now().strftime("%Y-%m-%d"))
    logger.info("Incremental update complete for %s", account_id)


def full_backfill_core(db: Session, client: ComposerClient, account_id: str):
    """First-sync core backfill with blocking non-trade activity sync.

    Ensures non-trade activity (cash flows) is applied before portfolio history
    and metrics are returned to the user for the first dashboard load.
    Trade transactions can continue in a follow-up phase.
    """
    logger.info("Starting first-sync core backfill for account %s...", account_id)

    # Required for first-view chart/metrics stability: run synchronously.
    # If non-trade report retrieval fails for this account type, continue with
    # fallback net-deposit behavior instead of aborting the entire sync.
    _safe_step(
        "cash_flows",
        _sync_cash_flows,
        db,
        client,
        account_id,
        since="2020-01-01",
        retries=_INITIAL_SYNC_STEP_RETRIES,
        retry_delay_seconds=_INITIAL_SYNC_STEP_RETRY_DELAY_SECONDS,
    )
    _safe_step(
        "portfolio_history",
        _sync_portfolio_history,
        db,
        client,
        account_id,
        retries=_INITIAL_SYNC_STEP_RETRIES,
        retry_delay_seconds=_INITIAL_SYNC_STEP_RETRY_DELAY_SECONDS,
        raise_on_failure=True,
    )
    _safe_step(
        "metrics",
        _recompute_metrics,
        db,
        account_id,
        retries=_INITIAL_SYNC_STEP_RETRIES,
        retry_delay_seconds=_INITIAL_SYNC_STEP_RETRY_DELAY_SECONDS,
        raise_on_failure=True,
    )

    # Remaining first-view data can degrade gracefully if individual steps fail.
    _safe_step(
        "holdings_history",
        _sync_holdings_history,
        db,
        client,
        account_id,
        retries=_INITIAL_SYNC_STEP_RETRIES,
        retry_delay_seconds=_INITIAL_SYNC_STEP_RETRY_DELAY_SECONDS,
    )
    _safe_step(
        "benchmark",
        _sync_benchmark,
        db,
        account_id,
        retries=_INITIAL_SYNC_STEP_RETRIES,
        retry_delay_seconds=_INITIAL_SYNC_STEP_RETRY_DELAY_SECONDS,
    )

    _safe_step(
        "symphony_allocations",
        _sync_symphony_allocations,
        db,
        client,
        account_id,
        retries=_INITIAL_SYNC_STEP_RETRIES,
        retry_delay_seconds=_INITIAL_SYNC_STEP_RETRY_DELAY_SECONDS,
    )
    _safe_step(
        "symphony_daily",
        _sync_symphony_daily_backfill,
        db,
        client,
        account_id,
        retries=_INITIAL_SYNC_STEP_RETRIES,
        retry_delay_seconds=_INITIAL_SYNC_STEP_RETRY_DELAY_SECONDS,
    )
    _safe_step(
        "symphony_metrics",
        _recompute_symphony_metrics,
        db,
        account_id,
        retries=_INITIAL_SYNC_STEP_RETRIES,
        retry_delay_seconds=_INITIAL_SYNC_STEP_RETRY_DELAY_SECONDS,
    )
    _safe_step(
        "symphony_catalog",
        _refresh_symphony_catalog_safe,
        db,
        retries=_INITIAL_SYNC_STEP_RETRIES,
        retry_delay_seconds=_INITIAL_SYNC_STEP_RETRY_DELAY_SECONDS,
    )

    set_sync_state(db, account_id, "initial_backfill_core_done", "true")
    logger.info("First-sync core backfill complete for account %s", account_id)


def finish_initial_backfill_activity(db: Session, client: ComposerClient, account_id: str):
    """Continuation for first sync focused on trade activity tables.

    Cash-flow-driven portfolio history and metrics are already finalized in
    full_backfill_core().
    """
    logger.info("Starting first-sync trade-activity backfill for account %s...", account_id)

    _safe_step(
        "transactions",
        _sync_transactions,
        db,
        client,
        account_id,
        since="2020-01-01",
        retries=_INITIAL_SYNC_STEP_RETRIES,
        retry_delay_seconds=_INITIAL_SYNC_STEP_RETRY_DELAY_SECONDS,
    )
    _safe_step(
        "holdings_history",
        _sync_holdings_history,
        db,
        client,
        account_id,
        retries=_INITIAL_SYNC_STEP_RETRIES,
        retry_delay_seconds=_INITIAL_SYNC_STEP_RETRY_DELAY_SECONDS,
    )

    set_sync_state(db, account_id, "initial_backfill_done", "true")
    set_sync_state(db, account_id, "last_sync_date", datetime.now().strftime("%Y-%m-%d"))
    logger.info("First-sync trade-activity backfill complete for account %s", account_id)


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
            is_manual=0,
        ))
        existing.add(key)
        new_count += 1

    db.commit()
    logger.info("Cash flows synced for %s: %d new", account_id, new_count)


def _roll_forward_cash_flow_totals(
    db: Session,
    account_id: str,
    *,
    preserve_baseline: bool = True,
) -> int:
    """Recompute cumulative cash-flow totals into existing DailyPortfolio rows.

    When `preserve_baseline` is True, the first portfolio row's existing totals
    are treated as a baseline offset. This keeps fallback net-deposit values
    stable for accounts where Composer non-trade reports are unavailable.
    """
    daily_rows = (
        db.query(DailyPortfolio)
        .filter_by(account_id=account_id)
        .order_by(DailyPortfolio.date)
        .all()
    )
    if not daily_rows:
        return 0

    all_cf = (
        db.query(CashFlow)
        .filter_by(account_id=account_id)
        .order_by(CashFlow.date)
        .all()
    )

    cum_deposits = 0.0
    cum_fees = 0.0
    cum_dividends = 0.0
    cum_by_date = {}

    cf_by_date: dict[str, list[CashFlow]] = {}
    for cf in all_cf:
        ds = str(cf.date)
        cf_by_date.setdefault(ds, []).append(cf)

    for ds in sorted(cf_by_date.keys()):
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

    cash_flow_dates = sorted(cum_by_date.keys())

    baseline_net_deposits = 0.0
    baseline_total_fees = 0.0
    baseline_total_dividends = 0.0
    if preserve_baseline:
        first_ds = daily_rows[0].date.isoformat()
        baseline_cum = {"net_deposits": 0.0, "total_fees": 0.0, "total_dividends": 0.0}
        baseline_idx = 0
        while baseline_idx < len(cash_flow_dates) and cash_flow_dates[baseline_idx] <= first_ds:
            baseline_cum = cum_by_date[cash_flow_dates[baseline_idx]]
            baseline_idx += 1

        baseline_net_deposits = round(
            float(daily_rows[0].net_deposits or 0.0) - baseline_cum["net_deposits"],
            2,
        )
        baseline_total_fees = round(
            float(daily_rows[0].total_fees or 0.0) - baseline_cum["total_fees"],
            2,
        )
        baseline_total_dividends = round(
            float(daily_rows[0].total_dividends or 0.0) - baseline_cum["total_dividends"],
            2,
        )

    updated_count = 0
    last_cum = {"net_deposits": 0.0, "total_fees": 0.0, "total_dividends": 0.0}
    cash_flow_idx = 0
    for row in daily_rows:
        ds = row.date.isoformat()
        while cash_flow_idx < len(cash_flow_dates) and cash_flow_dates[cash_flow_idx] <= ds:
            last_cum = cum_by_date[cash_flow_dates[cash_flow_idx]]
            cash_flow_idx += 1

        next_net_deposits = round(baseline_net_deposits + last_cum["net_deposits"], 2)
        next_total_fees = round(baseline_total_fees + last_cum["total_fees"], 2)
        next_total_dividends = round(
            baseline_total_dividends + last_cum["total_dividends"],
            2,
        )

        if row.net_deposits != next_net_deposits:
            row.net_deposits = next_net_deposits
            updated_count += 1
        if row.total_fees != next_total_fees:
            row.total_fees = next_total_fees
            updated_count += 1
        if row.total_dividends != next_total_dividends:
            row.total_dividends = next_total_dividends
            updated_count += 1

    db.commit()
    return updated_count


def _sync_portfolio_history(db: Session, client: ComposerClient, account_id: str):
    """Fetch portfolio history and upsert into daily_portfolio table."""
    history = client.get_portfolio_history(account_id)

    # Try to get current cash balance
    try:
        cash_balance = client.get_cash_balance(account_id)
    except Exception:
        cash_balance = 0.0

    new_count = 0
    today = datetime.now().strftime("%Y-%m-%d")
    history_sorted = sorted(history, key=lambda item: str(item.get("date", "")))
    for entry in history_sorted:
        ds_raw = str(entry.get("date", ""))
        try:
            d = date.fromisoformat(ds_raw)
        except Exception:
            continue
        ds = d.isoformat()

        existing = db.query(DailyPortfolio).filter_by(account_id=account_id, date=d).first()
        if existing:
            existing.portfolio_value = entry["portfolio_value"]
            # Only set cash_balance for today
            if ds == today:
                existing.cash_balance = cash_balance
        else:
            db.add(DailyPortfolio(
                account_id=account_id,
                date=d,
                portfolio_value=entry["portfolio_value"],
                cash_balance=cash_balance if ds == today else 0.0,
                net_deposits=0.0,
                total_fees=0.0,
                total_dividends=0.0,
            ))
            new_count += 1

    db.commit()

    _roll_forward_cash_flow_totals(db, account_id, preserve_baseline=False)

    # If no cash flows found, fall back to total-stats API for net_deposits
    has_cash_flows = db.query(CashFlow.id).filter(CashFlow.account_id == account_id).first() is not None
    if not has_cash_flows:
        try:
            total_stats = client.get_total_stats(account_id)
            fallback_deposits = float(total_stats.get("net_deposits", 0))
            for row in db.query(DailyPortfolio).filter_by(account_id=account_id).all():
                row.net_deposits = round(fallback_deposits, 2)
            db.commit()
            logger.info(
                "No cash flow data for %s - using total-stats net_deposits=%.2f as fallback",
                account_id,
                fallback_deposits,
            )
        except Exception:
            pass

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
    """Fetch benchmark daily closes and store.

    Incremental: only fetches from the last stored benchmark date onward.
    Provider order: Stooq (free historical) -> Finnhub candles fallback.
    """
    settings = get_settings()
    ticker = settings.benchmark_ticker

    # Find date range from daily_portfolio for this account
    first = db.query(func.min(DailyPortfolio.date)).filter(
        DailyPortfolio.account_id == account_id
    ).scalar()
    if not first:
        return

    # Start from last stored benchmark date (minus 1 day buffer) for incremental
    last_stored = db.query(func.max(BenchmarkData.date)).filter(
        BenchmarkData.symbol == ticker
    ).scalar()
    if last_stored:
        fetch_start = str(last_stored - timedelta(days=1))
    else:
        fetch_start = str(first)

    start_date = date.fromisoformat(fetch_start)
    end_date = date.today()
    rows = get_daily_closes_stooq(ticker, start_date, end_date)
    if not rows:
        try:
            rows = get_daily_closes(ticker, start_date, end_date)
        except FinnhubAccessError as e:
            logger.warning("Failed to fetch benchmark data (Finnhub access): %s", e)
            return
        except FinnhubError as e:
            logger.warning("Failed to fetch benchmark data (Finnhub error): %s", e)
            return
    if not rows:
        return

    new_count = 0
    for d, close_val in rows:
        existing = db.query(BenchmarkData).filter_by(date=d).first()
        if existing:
            existing.close = close_val
            existing.symbol = ticker
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


def _last_weekday_on_or_before(target: date) -> date:
    """Return the most recent weekday on or before target."""
    current = target
    while current.weekday() >= 5:
        current -= timedelta(days=1)
    return current


def _count_weekdays_between(start_exclusive: date, end_inclusive: date) -> int:
    """Count weekdays in (start_exclusive, end_inclusive]."""
    if end_inclusive <= start_exclusive:
        return 0

    count = 0
    current = start_exclusive + timedelta(days=1)
    while current <= end_inclusive:
        if current.weekday() < 5:
            count += 1
        current += timedelta(days=1)
    return count


def _backfill_missing_symphony_days(
    db: Session,
    client: ComposerClient,
    account_id: str,
    symphony_id: str,
    *,
    up_to_date: date,
    min_missing_weekdays: int,
) -> tuple[int, bool]:
    """Backfill missing symphony days only when downtime likely introduced gaps.

    Returns tuple: (inserted_rows, history_fetched).
    """
    last_stored_date = (
        db.query(func.max(SymphonyDailyPortfolio.date))
        .filter_by(account_id=account_id, symphony_id=symphony_id)
        .scalar()
    )

    should_fetch_history = last_stored_date is None
    if not should_fetch_history and last_stored_date is not None:
        missing_weekdays = _count_weekdays_between(last_stored_date, up_to_date)
        should_fetch_history = missing_weekdays >= min_missing_weekdays

    if not should_fetch_history:
        return 0, False

    try:
        history = client.get_symphony_history(account_id, symphony_id)
    except Exception as e:
        logger.warning("Failed incremental catch-up for symphony %s: %s", symphony_id, e)
        return 0, True

    if not history:
        return 0, True

    net_deps = _infer_net_deposits_from_history(history)
    existing_dates = {
        row[0]
        for row in (
            db.query(SymphonyDailyPortfolio.date)
            .filter(
                SymphonyDailyPortfolio.account_id == account_id,
                SymphonyDailyPortfolio.symphony_id == symphony_id,
                SymphonyDailyPortfolio.date <= up_to_date,
            )
            .all()
        )
    }

    inserted_rows = 0
    for idx, point in enumerate(history):
        try:
            point_date = date.fromisoformat(point["date"])
        except Exception:
            continue

        if point_date > up_to_date or point_date in existing_dates:
            continue

        db.add(
            SymphonyDailyPortfolio(
                account_id=account_id,
                symphony_id=symphony_id,
                date=point_date,
                portfolio_value=point["value"],
                net_deposits=round(net_deps[idx], 2),
            )
        )
        existing_dates.add(point_date)
        inserted_rows += 1

    return inserted_rows, True


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
    """Store today's symphony values and backfill missed weekday gaps when needed."""
    today = date.today()
    is_weekend = today.weekday() >= 5
    up_to_date = _last_weekday_on_or_before(today)
    min_missing_weekdays = 1 if is_weekend else 2

    try:
        symphonies = client.get_symphony_stats(account_id)
    except Exception as e:
        logger.warning("Failed to fetch symphony stats for incremental %s: %s", account_id, e)
        return

    today_new_count = 0
    catchup_new_count = 0
    history_fetches = 0
    for s in symphonies:
        sym_id = s.get("id", "")
        if not sym_id:
            continue

        inserted, history_fetched = _backfill_missing_symphony_days(
            db,
            client,
            account_id,
            sym_id,
            up_to_date=up_to_date,
            min_missing_weekdays=min_missing_weekdays,
        )
        catchup_new_count += inserted
        if history_fetched:
            history_fetches += 1
            time.sleep(0.5)

        if is_weekend:
            continue

        value = float(s.get("value") or 0.0)
        net_dep = float(s.get("net_deposits") or 0.0)

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
            today_new_count += 1

    db.commit()
    if is_weekend:
        logger.info(
            "Symphony daily incremental for %s (weekend catch-up): %d new history rows across %d symphonies (%d history fetches)",
            account_id,
            catchup_new_count,
            len(symphonies),
            history_fetches,
        )
    else:
        logger.info(
            "Symphony daily incremental for %s: %d new today rows and %d catch-up rows across %d symphonies (%d history fetches)",
            account_id,
            today_new_count,
            catchup_new_count,
            len(symphonies),
            history_fetches,
        )


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
