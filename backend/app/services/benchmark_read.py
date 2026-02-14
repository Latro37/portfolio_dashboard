"""Benchmark history read service."""

import logging
import math
import time
from datetime import date
from typing import Callable, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import BenchmarkData, CashFlow
from app.services.account_scope import resolve_account_ids
from app.services.date_filters import parse_iso_date
from app.services.finnhub_market_data import (
    FinnhubAccessError,
    FinnhubError,
    get_daily_closes,
    get_daily_closes_stooq,
    get_latest_price,
)
from app.services.metrics import compute_mwr

logger = logging.getLogger(__name__)

_benchmark_cache: Dict[Tuple[str, str, str, str], Tuple[float, list]] = {}
_BENCHMARK_TTL = 3600  # 1 hour


def get_benchmark_history_data(
    db: Session,
    ticker: str,
    start_date: Optional[str],
    end_date: Optional[str],
    account_id: Optional[str],
    get_daily_closes_stooq_fn: Callable[[str, date, date], List[Tuple[date, float]]] = get_daily_closes_stooq,
    get_daily_closes_fn: Callable[[str, date, date], List[Tuple[date, float]]] = get_daily_closes,
    get_latest_price_fn: Callable[[str], Optional[float]] = get_latest_price,
):
    """Fetch benchmark history and compute TWR, drawdown, and MWR."""
    ticker = ticker.strip().upper()
    if not ticker:
        raise HTTPException(400, "Ticker is required")

    if start_date:
        start_dt = parse_iso_date(start_date, "start_date")
    else:
        start_dt = date(2020, 1, 1)
    if end_date:
        end_dt = parse_iso_date(end_date, "end_date")
    else:
        end_dt = date.today()
    if start_dt > end_dt:
        raise HTTPException(400, "start_date cannot be after end_date")

    resolved_account_ids: List[str] = []
    if account_id:
        resolved_account_ids = resolve_account_ids(
            db,
            account_id,
            no_accounts_message="No accounts discovered. Check config.json and restart.",
        )

    s_date = str(start_dt)
    e_date = str(end_dt)
    account_scope = ",".join(sorted(resolved_account_ids))
    cache_key = (ticker, s_date, e_date, account_scope)

    if cache_key in _benchmark_cache:
        ts, cached_data = _benchmark_cache[cache_key]
        if time.time() - ts < _BENCHMARK_TTL:
            return {"ticker": ticker, "data": cached_data}

    closes: List[Tuple[date, float]] = get_daily_closes_stooq_fn(ticker, start_dt, end_dt)

    finnhub_error: Optional[str] = None
    if not closes:
        try:
            closes = get_daily_closes_fn(ticker, start_dt, end_dt)
        except FinnhubAccessError as exc:
            finnhub_error = str(exc)
            logger.warning("Finnhub access denied for %s candles: %s", ticker, exc)
        except FinnhubError as exc:
            finnhub_error = str(exc)
            logger.warning("Finnhub candle request failed for %s: %s", ticker, exc)

    if not closes:
        db_rows = (
            db.query(BenchmarkData)
            .filter(
                BenchmarkData.symbol == ticker,
                BenchmarkData.date >= start_dt,
                BenchmarkData.date <= end_dt,
            )
            .order_by(BenchmarkData.date)
            .all()
        )
        if db_rows:
            closes = [(row.date, float(row.close)) for row in db_rows]
            logger.info("Benchmark %s: using %d rows from DB fallback", ticker, len(closes))

    if not closes:
        if finnhub_error:
            raise HTTPException(
                502,
                f"Finnhub benchmark data unavailable for '{ticker}': {finnhub_error}",
            )
        raise HTTPException(400, f"No valid price data for '{ticker}'")

    closes.sort(key=lambda item: item[0])

    today = date.today()
    if closes[-1][0] < today <= end_dt:
        try:
            live_price = get_latest_price_fn(ticker)
            if live_price and not math.isnan(live_price):
                closes.append((today, float(live_price)))
            else:
                closes.append((today, closes[-1][1]))
        except FinnhubError:
            closes.append((today, closes[-1][1]))

    first_close = closes[0][1]
    twr_series: List[float] = []
    for _, close in closes:
        twr_series.append(round(((close / first_close) - 1) * 100, 4))

    peak = first_close
    dd_series: List[float] = []
    for _, close in closes:
        if close > peak:
            peak = close
        drawdown = ((close / peak) - 1) * 100 if peak > 0 else 0.0
        dd_series.append(round(drawdown, 4))

    mwr_series: List[float] = [0.0] * len(closes)
    if resolved_account_ids:
        cf_query = (
            db.query(CashFlow)
            .filter(
                CashFlow.account_id.in_(resolved_account_ids),
                func.lower(CashFlow.type).in_(["deposit", "withdrawal"]),
            )
            .order_by(CashFlow.date)
            .all()
        )

        ext_flows: Dict[date, float] = {}
        for cash_flow in cf_query:
            flow_date = (
                cash_flow.date
                if isinstance(cash_flow.date, date)
                else date.fromisoformat(str(cash_flow.date))
            )
            ext_flows[flow_date] = ext_flows.get(flow_date, 0) + cash_flow.amount

        if ext_flows:
            shares_acc = 0.0
            hypo_pv_list: List[float] = []
            bench_date_list: List[date] = []

            for bench_date, bench_close in closes:
                if bench_date in ext_flows and bench_close > 0:
                    shares_acc += ext_flows[bench_date] / bench_close
                hypo_pv_list.append(shares_acc * bench_close if shares_acc > 0 else 0.0)
                bench_date_list.append(bench_date)

            for i in range(1, len(closes)):
                if hypo_pv_list[i] > 0:
                    try:
                        _, mwr_period = compute_mwr(
                            bench_date_list[: i + 1], hypo_pv_list[: i + 1], ext_flows
                        )
                        mwr_series[i] = round(mwr_period * 100, 4)
                    except Exception:
                        pass

    result = []
    for i, (row_date, row_close) in enumerate(closes):
        result.append(
            {
                "date": str(row_date),
                "close": round(row_close, 2),
                "return_pct": twr_series[i],
                "drawdown_pct": dd_series[i],
                "mwr_pct": mwr_series[i],
            }
        )

    _benchmark_cache[cache_key] = (time.time(), result)
    return {"ticker": ticker, "data": result}
