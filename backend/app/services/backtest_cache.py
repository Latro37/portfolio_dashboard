"""Symphony backtest cache/read orchestration service."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from typing import Callable, Dict

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Account, SymphonyBacktestCache
from app.services.metrics import compute_all_metrics
from app.services.symphony_export import export_single_symphony

logger = logging.getLogger(__name__)

CACHE_TTL_HOURS = 24


def _compute_backtest_summary(dvm_capital: Dict, first_day: int, last_market_day: int) -> Dict:
    """Compute summary metrics from backtest dvm_capital series."""
    if not dvm_capital:
        return {}

    sorted_keys = sorted(dvm_capital.keys(), key=lambda k: int(k))
    if len(sorted_keys) < 2:
        return {}

    base_date = date(2020, 1, 1)
    initial_value = dvm_capital[sorted_keys[0]]
    daily_rows = []
    for key in sorted_keys:
        day_offset = int(key)
        d = base_date + timedelta(days=day_offset)
        daily_rows.append(
            {
                "date": d,
                "portfolio_value": dvm_capital[key],
                "net_deposits": initial_value,
            }
        )

    settings = get_settings()
    metrics = compute_all_metrics(daily_rows, [], None, settings.risk_free_rate)
    if not metrics:
        return {}

    last = metrics[-1]
    return {
        "cumulative_return_pct": last.get("cumulative_return_pct", 0),
        "annualized_return": last.get("annualized_return", 0),
        "annualized_return_cum": last.get("annualized_return_cum", 0),
        "time_weighted_return": last.get("time_weighted_return", 0),
        "cagr": last.get("cagr", 0),
        "sharpe_ratio": last.get("sharpe_ratio", 0),
        "sortino_ratio": last.get("sortino_ratio", 0),
        "calmar_ratio": last.get("calmar_ratio", 0),
        "max_drawdown": last.get("max_drawdown", 0),
        "annualized_volatility": last.get("annualized_volatility", 0),
        "win_rate": last.get("win_rate", 0),
        "best_day_pct": last.get("best_day_pct", 0),
        "worst_day_pct": last.get("worst_day_pct", 0),
        "profit_factor": last.get("profit_factor", 0),
        "median_drawdown": last.get("median_drawdown", 0),
        "longest_drawdown_days": last.get("longest_drawdown_days", 0),
        "median_drawdown_days": last.get("median_drawdown_days", 0),
    }


def _serialize_cached_backtest(cached: SymphonyBacktestCache) -> Dict:
    summary_metrics = json.loads(cached.summary_metrics_json) if cached.summary_metrics_json else {}
    return {
        "stats": json.loads(cached.stats_json),
        "dvm_capital": json.loads(cached.dvm_capital_json),
        "tdvm_weights": json.loads(cached.tdvm_weights_json),
        "benchmarks": json.loads(cached.benchmarks_json),
        "summary_metrics": summary_metrics,
        "first_day": cached.first_day,
        "last_market_day": cached.last_market_day,
        "cached_at": cached.cached_at.isoformat(),
        "last_semantic_update_at": cached.last_semantic_update_at or "",
    }


def get_symphony_backtest_data(
    db: Session,
    symphony_id: str,
    account_id: str,
    force_refresh: bool,
    get_client_for_account_fn: Callable[[Session, str], object],
    test_credential: str = "__TEST__",
) -> Dict:
    """Get backtest payload for a symphony, with TTL+semantic invalidation."""
    acct = db.query(Account).filter_by(id=account_id).first()
    if acct and acct.credential_name == test_credential:
        cached = db.query(SymphonyBacktestCache).filter_by(symphony_id=symphony_id).first()
        if cached:
            return _serialize_cached_backtest(cached)
        raise HTTPException(404, "No cached backtest for test symphony")

    client = get_client_for_account_fn(db, account_id)
    use_cache = False
    cached = None

    if not force_refresh:
        cached = db.query(SymphonyBacktestCache).filter_by(symphony_id=symphony_id).first()
        if cached and cached.cached_at > datetime.utcnow() - timedelta(hours=CACHE_TTL_HOURS):
            stale = False
            try:
                versions = client.get_symphony_versions(symphony_id)
                if versions:
                    newest = versions[0] if isinstance(versions, list) else {}
                    newest_ts = newest.get("created_at") or newest.get("updated_at") or ""
                    if newest_ts and cached.last_semantic_update_at:
                        stale = newest_ts > cached.last_semantic_update_at
                    elif newest_ts and not cached.last_semantic_update_at:
                        stale = True
            except Exception:
                pass

            if stale:
                try:
                    sym_stats = client.get_symphony_stats(account_id)
                    sym_name = next(
                        (s.get("name", symphony_id) for s in sym_stats if s.get("id") == symphony_id),
                        symphony_id,
                    )
                    export_single_symphony(client, symphony_id, sym_name)
                except Exception as exc:
                    logger.debug("Symphony export on edit failed for %s: %s", symphony_id, exc)
            else:
                use_cache = True

    if use_cache and cached:
        logger.info("Serving cached backtest for %s", symphony_id)
        return _serialize_cached_backtest(cached)

    logger.info("Fetching fresh backtest for %s (force=%s)", symphony_id, force_refresh)
    try:
        data = client.get_symphony_backtest(symphony_id)
    except Exception as exc:
        raise HTTPException(500, f"Backtest failed: {exc}")

    stats = data.get("stats", {})
    dvm_capital = data.get("dvm_capital", {})
    tdvm_weights = data.get("tdvm_weights", {})
    benchmarks = stats.get("benchmarks", {})
    first_day = data.get("first_day", 0)
    last_market_day = data.get("last_market_day", 0)
    semantic_ts = data.get("last_semantic_update_at", "")

    dvm_series = {}
    if dvm_capital:
        first_key = next(iter(dvm_capital))
        dvm_series = dvm_capital[first_key] if isinstance(dvm_capital[first_key], dict) else dvm_capital
    summary_metrics = _compute_backtest_summary(dvm_series, first_day, last_market_day)

    existing = db.query(SymphonyBacktestCache).filter_by(symphony_id=symphony_id).first()
    now = datetime.utcnow()
    cache_fields = dict(
        account_id=account_id,
        cached_at=now,
        stats_json=json.dumps(stats),
        dvm_capital_json=json.dumps(dvm_capital),
        tdvm_weights_json=json.dumps(tdvm_weights),
        benchmarks_json=json.dumps(benchmarks),
        summary_metrics_json=json.dumps(summary_metrics),
        first_day=first_day,
        last_market_day=last_market_day,
        last_semantic_update_at=semantic_ts or None,
    )
    if existing:
        for key, value in cache_fields.items():
            setattr(existing, key, value)
    else:
        db.add(SymphonyBacktestCache(symphony_id=symphony_id, **cache_fields))
    db.commit()

    return {
        "stats": stats,
        "dvm_capital": dvm_capital,
        "tdvm_weights": tdvm_weights,
        "benchmarks": benchmarks,
        "summary_metrics": summary_metrics,
        "first_day": first_day,
        "last_market_day": last_market_day,
        "cached_at": now.isoformat(),
        "last_semantic_update_at": semantic_ts or "",
    }
