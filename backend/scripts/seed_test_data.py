"""Seed synthetic test data for a large-portfolio user profile.

Usage:
    python -m scripts.seed_test_data          # seed data
    python -m scripts.seed_test_data --purge  # remove all test data

Generates ~100K rows of realistic data:
  - 1 account (credential_name="__TEST__")
  - 50 symphonies across 100 tickers
  - 4 years of daily portfolio + metrics history
  - Pre-built backtest cache per symphony
"""

import argparse
import json
import math
import os
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Tuple

import numpy as np

# ---------------------------------------------------------------------------
# Ensure the backend package is importable
# ---------------------------------------------------------------------------
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(_SCRIPT_DIR)
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.database import SessionLocal, init_db
from app.models import (
    Account,
    CashFlow,
    DailyMetrics,
    DailyPortfolio,
    HoldingsHistory,
    SymphonyAllocationHistory,
    SymphonyBacktestCache,
    SymphonyCatalogEntry,
    SymphonyDailyMetrics,
    SymphonyDailyPortfolio,
    SyncState,
    Transaction,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TEST_CREDENTIAL = "__TEST__"
TEST_ACCOUNT_ID = "test-account-001"
TEST_DISPLAY_NAME = "Test: Large Portfolio"
META_PATH = os.path.join(_BACKEND_DIR, "data", "test_symphony_meta.json")

NUM_SYMPHONIES = 50
NUM_TICKERS = 100
HISTORY_YEARS = 4
TARGET_TOTAL_VALUE = 6_000_000
STARTING_VALUE = 1_200_000

# Real-ish ticker pool (ETFs + large-cap stocks)
TICKER_POOL = [
    "SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "ARKK", "XLF", "XLK", "XLE",
    "XLV", "XLI", "XLC", "XLY", "XLP", "XLU", "XLRE", "XLB", "GLD", "SLV",
    "TLT", "HYG", "LQD", "BND", "EMB", "EFA", "EEM", "VWO", "IEMG", "VEA",
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B", "JPM", "V",
    "UNH", "JNJ", "WMT", "PG", "MA", "HD", "ABBV", "MRK", "PFE", "KO",
    "PEP", "COST", "TMO", "AVGO", "LLY", "ORCL", "ACN", "MCD", "NKE", "TXN",
    "CRM", "AMD", "INTC", "QCOM", "AMAT", "ISRG", "GILD", "MDLZ", "ADI", "LRCX",
    "SCHW", "GS", "MS", "BLK", "AXP", "CME", "ICE", "CB", "MMC", "PGR",
    "SHV", "GOVT", "IGSB", "VCSH", "VCIT", "MINT", "NEAR", "FLOT", "IGIB", "SPAB",
    "SOXX", "SMH", "XBI", "IBB", "HACK", "BOTZ", "ROBO", "FINX", "SKYY", "CLOU",
]

# Symphony name templates
SYMPHONY_NAMES = [
    "Momentum Alpha", "Value Rotation", "Growth & Income", "Tech Leaders",
    "Sector Momentum", "Dividend Kings", "Bond Ladder Plus", "Risk Parity Lite",
    "All-Weather Mix", "Global Macro", "Small Cap Value", "Quality Factor",
    "Low Volatility", "High Yield Plus", "Emerging Markets", "Real Assets",
    "Treasury Hedge", "Equity Income", "Innovation Growth", "Healthcare Select",
    "Clean Energy", "AI & Robotics", "Crypto Adjacent", "Commodity Trend",
    "Options Overlay", "Multi-Factor Core", "International Blend", "S&P Rotation",
    "NASDAQ Tactical", "Balanced Growth", "Conservative Income", "Aggressive Growth",
    "Market Neutral", "Long/Short Equity", "Trend Following", "Mean Reversion",
    "Pairs Trading", "Event Driven", "Merger Arb", "Convertible Arb",
    "Volatility Harvest", "Tail Risk Hedge", "Core Satellite", "Tax-Loss Harvest",
    "ESG Leaders", "Infrastructure", "REITs Plus", "Precious Metals",
    "Deflation Hedge", "Inflation Protect",
]

SYMPHONY_COLORS = [
    "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899",
    "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48",
    "#0ea5e9", "#a855f7", "#22c55e", "#eab308", "#d946ef", "#f43f5e",
    "#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#db2777",
    "#0891b2", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#be123c",
    "#0284c7", "#9333ea", "#16a34a", "#ca8a04", "#c026d3", "#e11d48",
    "#1d4ed8", "#b91c1c", "#047857", "#b45309", "#6d28d9", "#be185d",
    "#0e7490", "#4d7c0f", "#c2410c", "#4338ca", "#0f766e", "#9f1239",
    "#1e40af", "#991b1b",
]

REBALANCE_FREQS = ["Daily", "Weekly", "Monthly", "Quarterly"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def trading_days(start: date, end: date) -> List[date]:
    """Generate list of weekday dates between start and end (inclusive)."""
    days = []
    d = start
    while d <= end:
        if d.weekday() < 5:  # Mon-Fri
            days.append(d)
        d += timedelta(days=1)
    return days


def random_walk(n: int, mean: float = 0.0004, std: float = 0.012,
                regime_prob: float = 0.02, regime_mean: float = -0.008,
                regime_std: float = 0.025) -> np.ndarray:
    """Generate daily returns with occasional drawdown regimes."""
    returns = np.zeros(n)
    in_regime = False
    regime_days_left = 0
    for i in range(n):
        if not in_regime and random.random() < regime_prob:
            in_regime = True
            regime_days_left = random.randint(5, 30)
        if in_regime:
            returns[i] = np.random.normal(regime_mean, regime_std)
            regime_days_left -= 1
            if regime_days_left <= 0:
                in_regime = False
        else:
            returns[i] = np.random.normal(mean, std)
    return returns


def returns_to_values(start_val: float, daily_returns: np.ndarray,
                      deposits: np.ndarray) -> np.ndarray:
    """Convert daily returns + deposits into a portfolio value series."""
    values = np.zeros(len(daily_returns))
    values[0] = start_val
    for i in range(1, len(daily_returns)):
        values[i] = values[i - 1] * (1 + daily_returns[i]) + deposits[i]
    # Ensure no negative values
    values = np.maximum(values, 100.0)
    return values


def compute_rolling_metrics(values: np.ndarray, net_deps: np.ndarray,
                            daily_rets: np.ndarray) -> List[Dict]:
    """Compute rolling daily metrics from arrays. Returns list of metric dicts."""
    n = len(values)
    metrics = []
    risk_free_daily = 0.05 / 252

    for i in range(n):
        pv = values[i]
        nd = net_deps[i]

        # Cumulative return
        cum_ret = ((pv - nd) / nd * 100) if nd > 0 else 0.0

        # Total return dollars
        total_ret_dollars = pv - nd

        # Daily return
        dr = daily_rets[i] * 100  # percentage

        # TWR (chain-linked)
        twr = 1.0
        for j in range(1, i + 1):
            twr *= (1 + daily_rets[j])
        twr_pct = (twr - 1) * 100

        # Annualized return (from TWR)
        days_elapsed = max(i, 1)
        years = days_elapsed / 252
        ann_ret = ((twr ** (1 / years)) - 1) * 100 if years > 0.01 and twr > 0 else 0.0
        ann_ret_cum = ann_ret  # same basis

        # CAGR
        cagr = ann_ret

        # Volatility (annualized)
        if i >= 20:
            vol = np.std(daily_rets[max(0, i - 252):i + 1]) * math.sqrt(252) * 100
        else:
            vol = 0.0

        # Sharpe
        if vol > 0 and i >= 20:
            excess = np.mean(daily_rets[max(0, i - 252):i + 1]) - risk_free_daily
            sharpe = excess / np.std(daily_rets[max(0, i - 252):i + 1]) * math.sqrt(252)
        else:
            sharpe = 0.0

        # Sortino
        if i >= 20:
            neg_rets = daily_rets[max(0, i - 252):i + 1]
            neg_rets = neg_rets[neg_rets < 0]
            downside = np.std(neg_rets) * math.sqrt(252) if len(neg_rets) > 1 else 0.0
            excess_mean = np.mean(daily_rets[max(0, i - 252):i + 1]) - risk_free_daily
            sortino = (excess_mean / (downside / 100)) * math.sqrt(252) if downside > 0 else 0.0
        else:
            sortino = 0.0

        # Max drawdown
        peak = np.max(values[:i + 1])
        dd = ((pv - peak) / peak * 100) if peak > 0 else 0.0
        # Historical max drawdown
        running_peak = values[0]
        max_dd = 0.0
        for j in range(1, i + 1):
            running_peak = max(running_peak, values[j])
            dd_j = (values[j] - running_peak) / running_peak * 100
            max_dd = min(max_dd, dd_j)

        # Calmar
        calmar = abs(ann_ret / max_dd) if max_dd < -0.01 else 0.0

        # Win rate
        rets_so_far = daily_rets[1:i + 1]
        wins = np.sum(rets_so_far > 0)
        losses = np.sum(rets_so_far < 0)
        total_trades = wins + losses
        win_rate = (wins / total_trades * 100) if total_trades > 0 else 0.0

        # Best/worst day
        best_day = float(np.max(daily_rets[:i + 1]) * 100) if i > 0 else 0.0
        worst_day = float(np.min(daily_rets[:i + 1]) * 100) if i > 0 else 0.0

        # Profit factor
        gains = np.sum(rets_so_far[rets_so_far > 0]) if len(rets_so_far) > 0 else 0.0
        loss_sum = abs(np.sum(rets_so_far[rets_so_far < 0])) if len(rets_so_far) > 0 else 0.0
        pf = gains / loss_sum if loss_sum > 0 else 0.0

        # MWR placeholder (simplified)
        mwr = twr_pct  # approximate
        mwr_period = twr_pct

        metrics.append({
            "daily_return_pct": round(dr, 6),
            "cumulative_return_pct": round(cum_ret, 4),
            "total_return_dollars": round(total_ret_dollars, 2),
            "cagr": round(cagr, 4),
            "annualized_return": round(ann_ret, 4),
            "annualized_return_cum": round(ann_ret_cum, 4),
            "time_weighted_return": round(twr_pct, 4),
            "money_weighted_return": round(mwr, 4),
            "money_weighted_return_period": round(mwr_period, 4),
            "win_rate": round(win_rate, 2),
            "num_wins": int(wins),
            "num_losses": int(losses),
            "avg_win_pct": 0.0,
            "avg_loss_pct": 0.0,
            "max_drawdown": round(max_dd, 4),
            "current_drawdown": round(dd, 4),
            "sharpe_ratio": round(sharpe, 4),
            "calmar_ratio": round(calmar, 4),
            "sortino_ratio": round(sortino, 4),
            "annualized_volatility": round(vol, 4),
            "best_day_pct": round(best_day, 4),
            "worst_day_pct": round(worst_day, 4),
            "profit_factor": round(pf, 4),
        })

    return metrics


def date_to_epoch_day(d: date) -> int:
    """Convert a date to epoch day number (days since 1970-01-01)."""
    return (d - date(1970, 1, 1)).days


# ---------------------------------------------------------------------------
# Data generation
# ---------------------------------------------------------------------------

def generate_symphony_specs() -> List[Dict]:
    """Create specs for 50 symphonies with assigned tickers and target values."""
    random.seed(42)
    np.random.seed(42)

    # Distribute 100 tickers across 50 symphonies
    tickers = TICKER_POOL[:NUM_TICKERS]
    random.shuffle(tickers)

    specs = []
    # Assign sizes via power-law (a few large, many small)
    raw_sizes = np.random.pareto(1.5, NUM_SYMPHONIES) + 1
    raw_sizes = raw_sizes / raw_sizes.sum()

    for i in range(NUM_SYMPHONIES):
        # Each symphony gets 2-50 tickers
        if i < 3:
            # A few large symphonies with up to 50 tickers
            n_tickers = random.randint(35, 50)
        elif i < 10:
            n_tickers = random.randint(10, 30)
        else:
            n_tickers = random.randint(2, 15)

        # Assign tickers (with overlap allowed across symphonies)
        sym_tickers = random.sample(tickers, min(n_tickers, len(tickers)))

        specs.append({
            "symphony_id": f"test-sym-{i:03d}",
            "position_id": f"test-pos-{i:03d}",
            "name": SYMPHONY_NAMES[i],
            "color": SYMPHONY_COLORS[i],
            "size_weight": float(raw_sizes[i]),
            "tickers": sym_tickers,
            "rebalance_frequency": random.choice(REBALANCE_FREQS),
            "invested_since": None,  # filled later
        })

    return specs


def generate_data():
    """Generate all synthetic data and insert into DB."""
    random.seed(42)
    np.random.seed(42)

    print("Generating synthetic test data...")

    # Date range: 4 years back from today
    end_dt = date.today() - timedelta(days=1)
    start_dt = end_dt - timedelta(days=HISTORY_YEARS * 365)
    days = trading_days(start_dt, end_dt)
    n_days = len(days)
    print(f"  Date range: {start_dt} to {end_dt} ({n_days} trading days)")

    # Symphony specs
    specs = generate_symphony_specs()

    # Normalize size weights to sum to target value
    total_weight = sum(s["size_weight"] for s in specs)
    for s in specs:
        s["target_value"] = TARGET_TOTAL_VALUE * s["size_weight"] / total_weight
        s["start_value"] = STARTING_VALUE * s["size_weight"] / total_weight
        # Invested since: stagger over the first 6 months
        offset_days = random.randint(0, 180)
        s["invested_since"] = str(start_dt + timedelta(days=offset_days))

    # ------------------------------------------------------------------
    # Generate per-symphony daily data
    # ------------------------------------------------------------------
    sym_daily_data = {}  # symphony_id -> {days, values, net_deps, returns, metrics}

    for spec in specs:
        inv_start = date.fromisoformat(spec["invested_since"])
        sym_days = [d for d in days if d >= inv_start]
        n = len(sym_days)
        if n < 2:
            continue

        target = spec["target_value"]

        # Daily returns with positive drift (ensures most symphonies are profitable)
        mean_ret = random.uniform(0.0003, 0.0008)
        std_ret = random.uniform(0.008, 0.016)
        rets = random_walk(n, mean=mean_ret, std=std_ret,
                           regime_prob=0.015, regime_mean=-0.005, regime_std=0.02)
        rets[0] = 0.0

        # Build values from returns (no deposits yet, pure growth from $1)
        growth = np.cumprod(1 + rets)
        # Scale so final value = target
        values = growth * (target / growth[-1])

        # Create deposit schedule that gives a realistic cumulative return (15-50%)
        cum_return_target = random.uniform(0.15, 0.50)
        total_deposits = target / (1 + cum_return_target)

        # Split: ~60% initial, ~40% monthly contributions
        initial_pct = random.uniform(0.50, 0.70)
        initial_deposit = total_deposits * initial_pct
        remaining_deposits = total_deposits - initial_deposit

        # Count months for monthly deposit sizing
        n_months = max(1, int(n / 21))  # ~21 trading days per month
        monthly_deposit = remaining_deposits / n_months if n_months > 0 else 0

        # Build deposit array and net_deps
        deposit_events = np.zeros(n)
        deposit_events[0] = initial_deposit
        for j in range(1, n):
            if sym_days[j].day <= 3 and sym_days[j - 1].day > 3:
                deposit_events[j] = monthly_deposit
        net_deps = np.cumsum(deposit_events)

        # Use original growth returns directly — they represent the true
        # investment performance (TWR basis). Deposits are an accounting overlay.
        sym_daily_data[spec["symphony_id"]] = {
            "days": sym_days,
            "values": values,
            "net_deps": net_deps,
            "returns": rets,
        }

    # ------------------------------------------------------------------
    # Account-level aggregation
    # ------------------------------------------------------------------
    print("  Aggregating account-level data...")
    acct_values = np.zeros(n_days)
    acct_net_deps = np.zeros(n_days)
    day_to_idx = {d: i for i, d in enumerate(days)}

    for spec in specs:
        sid = spec["symphony_id"]
        if sid not in sym_daily_data:
            continue
        sd = sym_daily_data[sid]
        for j, d in enumerate(sd["days"]):
            idx = day_to_idx.get(d)
            if idx is not None:
                acct_values[idx] += sd["values"][j]
                acct_net_deps[idx] += sd["net_deps"][j]

    # Forward-fill zeros at the start (before first symphony invests)
    for i in range(n_days):
        if acct_values[i] > 0:
            break
        acct_values[i] = STARTING_VALUE
        acct_net_deps[i] = STARTING_VALUE

    # Account daily returns
    acct_returns = np.zeros(n_days)
    for i in range(1, n_days):
        if acct_values[i - 1] > 0:
            new_dep = acct_net_deps[i] - acct_net_deps[i - 1]
            acct_returns[i] = (acct_values[i] - acct_values[i - 1] - new_dep) / acct_values[i - 1]

    # ------------------------------------------------------------------
    # Compute metrics (sampled for performance — full rolling for last 60 days,
    # sparse before that)
    # ------------------------------------------------------------------
    print("  Computing account-level metrics (fast mode)...")
    acct_metrics = _fast_rolling_metrics(acct_values, acct_net_deps, acct_returns, n_days)

    print("  Computing symphony-level metrics...")
    sym_metrics_data = {}
    for spec in specs:
        sid = spec["symphony_id"]
        if sid not in sym_daily_data:
            continue
        sd = sym_daily_data[sid]
        n = len(sd["days"])
        sm = _fast_rolling_metrics(sd["values"], sd["net_deps"], sd["returns"], n)
        sym_metrics_data[sid] = sm

    # ------------------------------------------------------------------
    # Generate backtest cache data per symphony
    # ------------------------------------------------------------------
    print("  Generating backtest cache data...")
    backtest_caches = {}
    for spec in specs:
        sid = spec["symphony_id"]
        if sid not in sym_daily_data:
            continue
        sd = sym_daily_data[sid]
        bt_days = sd["days"]
        bt_values = sd["values"]

        # dvm_capital: {symphony_id: {epoch_day_str: value}}
        dvm = {}
        for j, d in enumerate(bt_days):
            dvm[str(date_to_epoch_day(d))] = round(float(bt_values[j]), 2)

        # tdvm_weights: {ticker: {epoch_day_str: weight}}
        tdvm = {}
        tickers = spec["tickers"]
        for t in tickers:
            tdvm[t] = {}
        # Generate weights for a few sample dates (every 30 trading days)
        for j in range(0, len(bt_days), 30):
            raw_w = np.random.dirichlet(np.ones(len(tickers)))
            for k, t in enumerate(tickers):
                tdvm[t][str(date_to_epoch_day(bt_days[j]))] = round(float(raw_w[k]), 6)

        # Summary metrics from the last day's rolling metrics
        sm = sym_metrics_data[sid]
        last_m = sm[-1]

        summary = {
            "cumulative_return_pct": last_m["cumulative_return_pct"],
            "annualized_return": last_m["annualized_return"],
            "annualized_return_cum": last_m["annualized_return_cum"],
            "sharpe_ratio": last_m["sharpe_ratio"],
            "sortino_ratio": last_m["sortino_ratio"],
            "calmar_ratio": last_m["calmar_ratio"],
            "max_drawdown": last_m["max_drawdown"],
            "annualized_volatility": last_m["annualized_volatility"],
            "win_rate": last_m["win_rate"],
            "median_drawdown": last_m["max_drawdown"] * 0.4,
            "longest_drawdown_days": random.randint(20, 120),
            "median_drawdown_days": random.randint(5, 30),
        }

        first_epoch = date_to_epoch_day(bt_days[0])
        last_epoch = date_to_epoch_day(bt_days[-1])
        # OOS date: ~6 months before end
        oos_date = bt_days[-1] - timedelta(days=180)
        oos_ts = f"{oos_date}T12:00:00.000000-05:00[America/New_York]"

        backtest_caches[sid] = {
            "dvm_capital": {sid: dvm},
            "tdvm_weights": tdvm,
            "stats": {},
            "benchmarks": {},
            "summary_metrics": summary,
            "first_day": first_epoch,
            "last_market_day": last_epoch,
            "last_semantic_update_at": oos_ts,
        }

    # ------------------------------------------------------------------
    # Diverge live data from backtest by 5–25 bps/day
    # ------------------------------------------------------------------
    print("  Adding live vs backtest divergence (5-25 bps/day)...")
    for spec in specs:
        sid = spec["symphony_id"]
        if sid not in sym_daily_data:
            continue
        sd = sym_daily_data[sid]
        n = len(sd["days"])
        # Daily divergence: uniform 5-25 bps with random sign
        bps_range = random.uniform(5, 25)  # bps magnitude for this symphony
        daily_drift = np.random.normal(0, bps_range / 10000, n)
        daily_drift[0] = 0.0
        # Apply cumulative drift to values
        cum_drift = np.cumprod(1 + daily_drift)
        sd["values"] = sd["values"] * cum_drift
        # Recompute daily returns for the diverged live series
        new_rets = np.zeros(n)
        for j in range(1, n):
            dep_delta = sd["net_deps"][j] - sd["net_deps"][j - 1]
            if sd["values"][j - 1] > 0:
                new_rets[j] = (sd["values"][j] - sd["values"][j - 1] - dep_delta) / sd["values"][j - 1]
        sd["returns"] = new_rets

    # Re-aggregate account-level data after divergence
    print("  Re-aggregating account-level data after divergence...")
    acct_values = np.zeros(n_days)
    acct_net_deps = np.zeros(n_days)
    for spec in specs:
        sid = spec["symphony_id"]
        if sid not in sym_daily_data:
            continue
        sd = sym_daily_data[sid]
        for j, d in enumerate(sd["days"]):
            idx = day_to_idx.get(d)
            if idx is not None:
                acct_values[idx] += sd["values"][j]
                acct_net_deps[idx] += sd["net_deps"][j]
    for i in range(n_days):
        if acct_values[i] > 0:
            break
        acct_values[i] = STARTING_VALUE
        acct_net_deps[i] = STARTING_VALUE
    acct_returns = np.zeros(n_days)
    for i in range(1, n_days):
        if acct_values[i - 1] > 0:
            new_dep = acct_net_deps[i] - acct_net_deps[i - 1]
            acct_returns[i] = (acct_values[i] - acct_values[i - 1] - new_dep) / acct_values[i - 1]
    acct_metrics = _fast_rolling_metrics(acct_values, acct_net_deps, acct_returns, n_days)

    # Recompute symphony-level metrics for diverged live data
    print("  Recomputing symphony-level metrics for live data...")
    sym_metrics_data = {}
    for spec in specs:
        sid = spec["symphony_id"]
        if sid not in sym_daily_data:
            continue
        sd = sym_daily_data[sid]
        n = len(sd["days"])
        sm = _fast_rolling_metrics(sd["values"], sd["net_deps"], sd["returns"], n)
        sym_metrics_data[sid] = sm

    # ------------------------------------------------------------------
    # Write to DB
    # ------------------------------------------------------------------
    db = SessionLocal()
    try:
        _insert_all(db, specs, days, acct_values, acct_net_deps, acct_returns,
                     acct_metrics, sym_daily_data, sym_metrics_data,
                     backtest_caches)
        db.commit()
        print("  All data committed to DB.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    # ------------------------------------------------------------------
    # Write symphony metadata JSON
    # ------------------------------------------------------------------
    _write_meta_json(specs, sym_daily_data, sym_metrics_data)
    print(f"  Metadata written to {META_PATH}")
    print("Done! Test account visible as '{}'.".format(TEST_DISPLAY_NAME))


def _fast_rolling_metrics(values, net_deps, daily_rets, n):
    """Compute rolling metrics efficiently — full detail only for recent data."""
    risk_free_daily = 0.05 / 252
    metrics = []

    for i in range(n):
        pv = float(values[i])
        nd = float(net_deps[i])
        dr = float(daily_rets[i]) * 100

        cum_ret = ((pv - nd) / nd * 100) if nd > 0 else 0.0
        total_ret = pv - nd

        # TWR (chain-linked) — use log trick for speed
        log_sum = np.sum(np.log1p(daily_rets[1:i + 1])) if i > 0 else 0.0
        twr = math.exp(log_sum) - 1
        twr_pct = twr * 100

        days_elapsed = max(i, 1)
        years = days_elapsed / 252
        ann_ret = (((1 + twr) ** (1 / years)) - 1) * 100 if years > 0.01 and twr > -1 else 0.0

        # Window for vol/sharpe (last 252 days or all)
        win_start = max(0, i - 252)
        window = daily_rets[win_start:i + 1]

        vol = float(np.std(window) * math.sqrt(252) * 100) if i >= 20 else 0.0

        if vol > 0 and i >= 20:
            excess = float(np.mean(window)) - risk_free_daily
            sharpe = excess / float(np.std(window)) * math.sqrt(252)
        else:
            sharpe = 0.0

        # Sortino
        neg = window[window < 0]
        if len(neg) > 1 and i >= 20:
            ds = float(np.std(neg)) * math.sqrt(252)
            sortino = (float(np.mean(window)) - risk_free_daily) / ds * math.sqrt(252) if ds > 0 else 0.0
        else:
            sortino = 0.0

        # Drawdown
        running_peak = float(np.max(values[:i + 1]))
        cur_dd = ((pv - running_peak) / running_peak * 100) if running_peak > 0 else 0.0
        # Max drawdown
        peaks = np.maximum.accumulate(values[:i + 1])
        dds = (values[:i + 1] - peaks) / np.where(peaks > 0, peaks, 1) * 100
        max_dd = float(np.min(dds))

        calmar = abs(ann_ret / max_dd) if max_dd < -0.01 else 0.0

        rets_so_far = daily_rets[1:i + 1]
        wins = int(np.sum(rets_so_far > 0))
        losses = int(np.sum(rets_so_far < 0))
        total = wins + losses
        win_rate = (wins / total * 100) if total > 0 else 0.0

        best_day = float(np.max(daily_rets[:i + 1]) * 100) if i > 0 else 0.0
        worst_day = float(np.min(daily_rets[:i + 1]) * 100) if i > 0 else 0.0

        gains = float(np.sum(rets_so_far[rets_so_far > 0])) if len(rets_so_far) > 0 else 0.0
        loss_sum = float(abs(np.sum(rets_so_far[rets_so_far < 0]))) if len(rets_so_far) > 0 else 0.0
        pf = gains / loss_sum if loss_sum > 0 else 0.0

        metrics.append({
            "daily_return_pct": round(dr, 6),
            "cumulative_return_pct": round(cum_ret, 4),
            "total_return_dollars": round(total_ret, 2),
            "cagr": round(ann_ret, 4),
            "annualized_return": round(ann_ret, 4),
            "annualized_return_cum": round(ann_ret, 4),
            "time_weighted_return": round(twr_pct, 4),
            "money_weighted_return": round(twr_pct, 4),
            "money_weighted_return_period": round(twr_pct, 4),
            "win_rate": round(win_rate, 2),
            "num_wins": wins,
            "num_losses": losses,
            "avg_win_pct": 0.0,
            "avg_loss_pct": 0.0,
            "max_drawdown": round(max_dd, 4),
            "current_drawdown": round(cur_dd, 4),
            "sharpe_ratio": round(sharpe, 4),
            "calmar_ratio": round(calmar, 4),
            "sortino_ratio": round(sortino, 4),
            "annualized_volatility": round(vol, 4),
            "best_day_pct": round(best_day, 4),
            "worst_day_pct": round(worst_day, 4),
            "profit_factor": round(pf, 4),
        })

    return metrics


def _insert_all(db, specs, days, acct_values, acct_net_deps, acct_returns,
                acct_metrics, sym_daily_data, sym_metrics_data, backtest_caches):
    """Insert all generated data into the database."""
    n_days = len(days)

    # 1. Account
    print("  Inserting Account...")
    existing = db.query(Account).filter_by(id=TEST_ACCOUNT_ID).first()
    if existing:
        existing.credential_name = TEST_CREDENTIAL
        existing.display_name = TEST_DISPLAY_NAME
        existing.account_type = "INDIVIDUAL"
        existing.status = "ACTIVE"
    else:
        db.add(Account(
            id=TEST_ACCOUNT_ID,
            credential_name=TEST_CREDENTIAL,
            account_type="INDIVIDUAL",
            display_name=TEST_DISPLAY_NAME,
            status="ACTIVE",
        ))
    db.flush()

    # 2. DailyPortfolio
    print("  Inserting DailyPortfolio...")
    for i in range(n_days):
        db.merge(DailyPortfolio(
            account_id=TEST_ACCOUNT_ID,
            date=days[i],
            portfolio_value=round(float(acct_values[i]), 2),
            net_deposits=round(float(acct_net_deps[i]), 2),
            cash_balance=0.0,
            total_fees=0.0,
            total_dividends=0.0,
        ))
    db.flush()

    # 3. DailyMetrics
    print("  Inserting DailyMetrics...")
    for i in range(n_days):
        m = acct_metrics[i]
        db.merge(DailyMetrics(
            account_id=TEST_ACCOUNT_ID,
            date=days[i],
            **m,
        ))
    db.flush()

    # 4. CashFlow (monthly deposits)
    print("  Inserting CashFlows...")
    # Delete existing test cash flows first
    db.query(CashFlow).filter_by(account_id=TEST_ACCOUNT_ID).delete()
    monthly_deposit = TARGET_TOTAL_VALUE * 0.005  # ~$30K/month total
    current_d = days[0]
    cf_id = 1
    while current_d <= days[-1]:
        db.add(CashFlow(
            account_id=TEST_ACCOUNT_ID,
            date=current_d,
            type="deposit",
            amount=round(monthly_deposit, 2),
            description="Monthly deposit",
        ))
        # Next month
        if current_d.month == 12:
            current_d = date(current_d.year + 1, 1, 5)
        else:
            current_d = date(current_d.year, current_d.month + 1, 5)
        # Adjust to weekday
        while current_d.weekday() >= 5:
            current_d += timedelta(days=1)
    db.flush()

    # 5. HoldingsHistory (latest date, 100 tickers)
    print("  Inserting HoldingsHistory...")
    db.query(HoldingsHistory).filter_by(account_id=TEST_ACCOUNT_ID).delete()
    all_tickers = TICKER_POOL[:NUM_TICKERS]
    latest_date = days[-1]
    for t in all_tickers:
        db.add(HoldingsHistory(
            account_id=TEST_ACCOUNT_ID,
            date=latest_date,
            symbol=t,
            quantity=round(random.uniform(10, 500), 2),
        ))
    db.flush()

    # 6. SymphonyDailyPortfolio + SymphonyDailyMetrics
    print("  Inserting SymphonyDailyPortfolio + SymphonyDailyMetrics (this may take a moment)...")
    batch_count = 0
    for spec in specs:
        sid = spec["symphony_id"]
        if sid not in sym_daily_data:
            continue
        sd = sym_daily_data[sid]
        sm = sym_metrics_data[sid]
        for j in range(len(sd["days"])):
            db.merge(SymphonyDailyPortfolio(
                account_id=TEST_ACCOUNT_ID,
                symphony_id=sid,
                date=sd["days"][j],
                portfolio_value=round(float(sd["values"][j]), 2),
                net_deposits=round(float(sd["net_deps"][j]), 2),
            ))
            m = sm[j]
            db.merge(SymphonyDailyMetrics(
                account_id=TEST_ACCOUNT_ID,
                symphony_id=sid,
                date=sd["days"][j],
                **m,
            ))
            batch_count += 1
            if batch_count % 10000 == 0:
                db.flush()
                print(f"    ...{batch_count} rows flushed")
    db.flush()
    print(f"  Total symphony daily rows: {batch_count * 2}")

    # 7. SymphonyAllocationHistory (latest date per symphony)
    print("  Inserting SymphonyAllocationHistory...")
    db.query(SymphonyAllocationHistory).filter_by(account_id=TEST_ACCOUNT_ID).delete()
    for spec in specs:
        sid = spec["symphony_id"]
        if sid not in sym_daily_data:
            continue
        sd = sym_daily_data[sid]
        tickers = spec["tickers"]
        total_val = float(sd["values"][-1])
        weights = np.random.dirichlet(np.ones(len(tickers)))
        for k, t in enumerate(tickers):
            db.add(SymphonyAllocationHistory(
                account_id=TEST_ACCOUNT_ID,
                symphony_id=sid,
                date=latest_date,
                ticker=t,
                allocation_pct=round(float(weights[k]) * 100, 2),
                value=round(total_val * float(weights[k]), 2),
            ))
    db.flush()

    # 8. SymphonyBacktestCache
    print("  Inserting SymphonyBacktestCache...")
    for spec in specs:
        sid = spec["symphony_id"]
        if sid not in backtest_caches:
            continue
        bc = backtest_caches[sid]
        existing_cache = db.query(SymphonyBacktestCache).filter_by(symphony_id=sid).first()
        fields = dict(
            account_id=TEST_ACCOUNT_ID,
            cached_at=datetime.now(timezone.utc),
            stats_json=json.dumps(bc["stats"]),
            dvm_capital_json=json.dumps(bc["dvm_capital"]),
            tdvm_weights_json=json.dumps(bc["tdvm_weights"]),
            benchmarks_json=json.dumps(bc["benchmarks"]),
            summary_metrics_json=json.dumps(bc["summary_metrics"]),
            first_day=bc["first_day"],
            last_market_day=bc["last_market_day"],
            last_semantic_update_at=bc["last_semantic_update_at"],
        )
        if existing_cache:
            for k, v in fields.items():
                setattr(existing_cache, k, v)
        else:
            db.add(SymphonyBacktestCache(symphony_id=sid, **fields))
    db.flush()

    # 9. SymphonyCatalogEntry
    print("  Inserting SymphonyCatalogEntry...")
    for spec in specs:
        existing_cat = db.query(SymphonyCatalogEntry).filter_by(symphony_id=spec["symphony_id"]).first()
        if existing_cat:
            existing_cat.name = spec["name"]
            existing_cat.source = "invested"
            existing_cat.credential_name = TEST_CREDENTIAL
            existing_cat.updated_at = datetime.now(timezone.utc)
        else:
            db.add(SymphonyCatalogEntry(
                symphony_id=spec["symphony_id"],
                name=spec["name"],
                source="invested",
                credential_name=TEST_CREDENTIAL,
                updated_at=datetime.now(timezone.utc),
            ))
    db.flush()

    # 10. SyncState
    print("  Inserting SyncState...")
    db.merge(SyncState(account_id=TEST_ACCOUNT_ID, key="initial_backfill_done", value="true"))
    db.merge(SyncState(account_id=TEST_ACCOUNT_ID, key="last_sync_date", value=str(days[-1])))
    db.flush()


def _write_meta_json(specs, sym_daily_data, sym_metrics_data):
    """Write static symphony metadata to JSON for the list_symphonies bypass."""
    meta = {}
    for spec in specs:
        sid = spec["symphony_id"]
        if sid not in sym_daily_data:
            continue
        sd = sym_daily_data[sid]
        sm = sym_metrics_data[sid]
        last_m = sm[-1]

        # Latest values
        val = float(sd["values"][-1])
        nd = float(sd["net_deps"][-1])
        prev_val = float(sd["values"][-2]) if len(sd["values"]) > 1 else val

        # Holdings with allocations
        tickers = spec["tickers"]
        weights = np.random.dirichlet(np.ones(len(tickers)))
        holdings = []
        for k, t in enumerate(tickers):
            holdings.append({
                "ticker": t,
                "allocation": round(float(weights[k]) * 100, 2),
                "value": round(val * float(weights[k]), 2),
                "last_percent_change": round(random.uniform(-3, 3), 2),
            })

        meta[sid] = {
            "name": spec["name"],
            "color": spec["color"],
            "position_id": spec["position_id"],
            "invested_since": spec["invested_since"],
            "rebalance_frequency": spec["rebalance_frequency"],
            "last_rebalance_on": str(sd["days"][-1]),
            "next_rebalance_on": None,
            "value": round(val, 2),
            "net_deposits": round(nd, 2),
            "cash": round(val * 0.02, 2),  # ~2% cash
            "total_return": round(val - nd, 2),
            "cumulative_return_pct": round(last_m["cumulative_return_pct"], 2),
            "simple_return": round(last_m["cumulative_return_pct"], 2),
            "time_weighted_return": round(last_m["time_weighted_return"], 2),
            "last_dollar_change": round(val - prev_val, 2),
            "last_percent_change": round((val - prev_val) / prev_val * 100, 2) if prev_val > 0 else 0,
            "sharpe_ratio": round(last_m["sharpe_ratio"], 2),
            "max_drawdown": round(last_m["max_drawdown"], 2),
            "annualized_return": round(last_m["annualized_return"], 2),
            "holdings": holdings,
        }

    os.makedirs(os.path.dirname(META_PATH), exist_ok=True)
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)


# ---------------------------------------------------------------------------
# Purge
# ---------------------------------------------------------------------------

def purge_test_data():
    """Remove all test data from the database."""
    print("Purging test data...")
    db = SessionLocal()
    try:
        # Tables with account_id column
        for model in [
            DailyPortfolio, DailyMetrics, CashFlow, HoldingsHistory,
            SymphonyDailyPortfolio, SymphonyDailyMetrics,
            SymphonyAllocationHistory, Transaction, SyncState,
        ]:
            count = db.query(model).filter_by(account_id=TEST_ACCOUNT_ID).delete()
            print(f"  Deleted {count} rows from {model.__tablename__}")

        # SymphonyBacktestCache + SymphonyCatalogEntry (by symphony_id pattern)
        count = db.query(SymphonyBacktestCache).filter(
            SymphonyBacktestCache.symphony_id.like("test-sym-%")
        ).delete(synchronize_session=False)
        print(f"  Deleted {count} rows from symphony_backtest_cache")

        count = db.query(SymphonyCatalogEntry).filter(
            SymphonyCatalogEntry.credential_name == TEST_CREDENTIAL
        ).delete()
        print(f"  Deleted {count} rows from symphony_catalog")

        # Account
        count = db.query(Account).filter_by(id=TEST_ACCOUNT_ID).delete()
        print(f"  Deleted {count} rows from accounts")

        db.commit()
        print("Purge complete.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    # Remove meta JSON
    if os.path.exists(META_PATH):
        os.remove(META_PATH)
        print(f"  Removed {META_PATH}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed or purge synthetic test data")
    parser.add_argument("--purge", action="store_true", help="Remove all test data")
    args = parser.parse_args()

    init_db()

    if args.purge:
        purge_test_data()
    else:
        # Purge first to avoid duplicates
        purge_test_data()
        generate_data()
