"""Symphony benchmark read service (backtest-as-benchmark overlay)."""

from __future__ import annotations

import logging
import math
import time
from datetime import date
from typing import Dict, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.composer_client import ComposerClient
from app.config import load_accounts
from app.models import Account

logger = logging.getLogger(__name__)

_symphony_bench_cache: Dict[str, Tuple[float, Dict]] = {}
_SYMPHONY_BENCH_TTL = 3600  # 1 hour


def _epoch_day_to_date(day_num: int) -> date:
    return date.fromordinal(date(1970, 1, 1).toordinal() + day_num)


def get_symphony_benchmark_data(
    db: Session,
    symphony_id: str,
    account_id: Optional[str] = None,  # kept for interface compatibility
) -> Dict:
    """Fetch symphony backtest and map to benchmark-history chart format."""
    symphony_id = symphony_id.strip()
    if not symphony_id:
        raise HTTPException(400, "Symphony ID is required")

    if symphony_id in _symphony_bench_cache:
        ts, cached = _symphony_bench_cache[symphony_id]
        if time.time() - ts < _SYMPHONY_BENCH_TTL:
            return cached

    all_accounts = db.query(Account).all()
    if not all_accounts:
        raise HTTPException(404, "No accounts discovered")

    accounts_creds = load_accounts()
    cred_map: Dict[str, ComposerClient] = {}
    for acct in all_accounts:
        if acct.credential_name not in cred_map:
            for creds in accounts_creds:
                if creds.name == acct.credential_name:
                    cred_map[acct.credential_name] = ComposerClient.from_credentials(creds)
                    break

    backtest_data = None
    last_error = ""
    client = None
    for cred_name, cred_client in cred_map.items():
        try:
            client = cred_client
            backtest_data = cred_client.get_symphony_backtest(symphony_id)
            break
        except Exception as exc:
            last_error = str(exc)
            logger.debug("Backtest for %s failed with credentials '%s': %s", symphony_id, cred_name, exc)
            continue

    if backtest_data is None:
        raise HTTPException(404, f"Symphony '{symphony_id}' not found or backtest failed: {last_error}")

    stats = backtest_data.get("stats", {})
    symphony_name = stats.get("name", "") or backtest_data.get("name", "")
    if not symphony_name:
        try:
            score = client.get_symphony_score(symphony_id) if client else {}
            symphony_name = score.get("name", "") or symphony_id
        except Exception:
            symphony_name = symphony_id

    dvm_capital = backtest_data.get("dvm_capital", {})
    if not dvm_capital:
        raise HTTPException(400, "No backtest data available for this symphony")

    first_key = next(iter(dvm_capital))
    series = dvm_capital[first_key] if isinstance(dvm_capital[first_key], dict) else dvm_capital

    sorted_keys = sorted(series.keys(), key=lambda k: int(k))
    if len(sorted_keys) < 2:
        raise HTTPException(400, "Insufficient backtest data")

    closes = []
    for key in sorted_keys:
        day_num = int(key)
        row_date = _epoch_day_to_date(day_num)
        value = float(series[key])
        if not math.isnan(value) and value > 0:
            closes.append((row_date, value))

    if not closes:
        raise HTTPException(400, "No valid backtest data")

    first_value = closes[0][1]
    result_data = []
    peak = first_value
    for row_date, value in closes:
        return_pct = round(((value / first_value) - 1) * 100, 4)
        if value > peak:
            peak = value
        drawdown_pct = round(((value / peak) - 1) * 100, 4) if peak > 0 else 0.0
        result_data.append(
            {
                "date": str(row_date),
                "close": round(value, 2),
                "return_pct": return_pct,
                "drawdown_pct": drawdown_pct,
                "mwr_pct": 0.0,
            }
        )

    response = {"name": symphony_name, "ticker": symphony_name, "data": result_data}
    _symphony_bench_cache[symphony_id] = (time.time(), response)
    return response
