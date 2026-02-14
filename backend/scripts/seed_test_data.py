"""Seed synthetic test data for test-mode personas.

Usage:
    python -m scripts.seed_test_data                              # seed power profile
    python -m scripts.seed_test_data --profile basic              # seed basic profile
    python -m scripts.seed_test_data --profile power --seed 1234
    python -m scripts.seed_test_data --profile power --end-date 2025-12-31
    python -m scripts.seed_test_data --purge                      # remove all test data
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

from app.database import SessionLocal, init_db, db_url as ACTIVE_DB_URL
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
TEST_DISPLAY_NAME = "Test: Power Portfolio"
META_PATH = os.path.join(_BACKEND_DIR, "data", "test_symphony_meta.json")

PROFILE_CONFIGS: Dict[str, Dict[str, object]] = {
    "basic": {
        "display_name": "Test: Basic Portfolio",
        "num_symphonies": 3,
        "num_tickers": 12,
        "history_days": 270,  # ~9 months
        "target_total_value": 250_000.0,
        "starting_value": 75_000.0,
        "default_seed": 17,
    },
    "power": {
        "display_name": "Test: Power Portfolio",
        "num_symphonies": 25,
        "num_tickers": 50,
        "history_days": 730,  # 2 years
        "target_total_value": 3_000_000.0,
        "starting_value": 800_000.0,
        "default_seed": 42,
    },
}

# Active profile values (set by _apply_profile)
NUM_SYMPHONIES = 25
NUM_TICKERS = 50
HISTORY_DAYS = 730
TARGET_TOTAL_VALUE = 3_000_000.0
STARTING_VALUE = 800_000.0
DEFAULT_SEED = 42

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

def _apply_profile(profile: str):
    """Apply profile config to module-level generation constants."""
    global TEST_DISPLAY_NAME
    global NUM_SYMPHONIES, NUM_TICKERS, HISTORY_DAYS
    global TARGET_TOTAL_VALUE, STARTING_VALUE, DEFAULT_SEED

    cfg = PROFILE_CONFIGS[profile]
    TEST_DISPLAY_NAME = str(cfg["display_name"])
    NUM_SYMPHONIES = int(cfg["num_symphonies"])
    NUM_TICKERS = int(cfg["num_tickers"])
    HISTORY_DAYS = int(cfg["history_days"])
    TARGET_TOTAL_VALUE = float(cfg["target_total_value"])
    STARTING_VALUE = float(cfg["starting_value"])
    DEFAULT_SEED = int(cfg["default_seed"])


def _parse_iso_date(date_str: str) -> date:
    """Parse YYYY-MM-DD into a date for deterministic seeding."""
    try:
        return date.fromisoformat(date_str)
    except ValueError as e:
        raise ValueError(f"Invalid --end-date '{date_str}'. Use YYYY-MM-DD.") from e


def _ensure_safe_target_db(force: bool):
    """Prevent accidental writes to production DB unless explicitly forced."""
    if force:
        return
    active = (ACTIVE_DB_URL or "").lower()
    if "portfolio_test.db" in active or "_test" in active:
        return
    raise SystemExit(
        "Refusing to seed/purge non-test database.\n"
        f"Active DB URL: {ACTIVE_DB_URL}\n"
        "Set CPV_DATABASE_URL=sqlite:///data/portfolio_test.db or pass --force."
    )

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
    """Create symphony specs using the currently selected profile."""
    # Use NUM_TICKERS from active profile and current RNG state from generate_data().
    tickers = TICKER_POOL[:NUM_TICKERS]
    random.shuffle(tickers)

    specs = []
    # Assign sizes via power-law (a few large, many small)
    raw_sizes = np.random.pareto(1.5, NUM_SYMPHONIES) + 1
    raw_sizes = raw_sizes / raw_sizes.sum()

    for i in range(NUM_SYMPHONIES):
        # Each symphony gets a realistic breadth based on selected profile size.
        if NUM_TICKERS <= 15:
            n_tickers = random.randint(2, min(8, NUM_TICKERS))
        elif i < 3:
            n_tickers = random.randint(20, min(35, NUM_TICKERS))
        elif i < 10:
            n_tickers = random.randint(8, min(20, NUM_TICKERS))
        else:
            n_tickers = random.randint(2, min(12, NUM_TICKERS))

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


def generate_data(seed: int | None = None, end_date: date | None = None):
    """Generate all synthetic data and insert into DB."""
    if seed is None:
        seed = DEFAULT_SEED
    random.seed(seed)
    np.random.seed(seed)

    print("Generating synthetic test data...")
    print(f"  Seed: {seed}")

    # Date range controlled by profile size; optional fixed end date for reproducibility.
    end_dt = end_date or (date.today() - timedelta(days=1))
    start_dt = end_dt - timedelta(days=HISTORY_DAYS)
    days = trading_days(start_dt, end_dt)
    n_days = len(days)
    print(f"  Date range: {start_dt} to {end_dt} ({n_days} trading days)")

    # Symphony specs
    specs = generate_symphony_specs()
    # Sparse global contribution calendar: every ~2 weeks (10 trading days).
    global_contrib_dates = {d for i, d in enumerate(days) if i > 0 and i % 10 == 0}
    # Stagger onboarding only on the same sparse cadence across the first ~6 months.
    onboarding_cutoff_idx = min(len(days), 126)  # ~6 months of trading days
    onboarding_dates = [days[i] for i in range(0, onboarding_cutoff_idx, 10)]
    if not onboarding_dates:
        onboarding_dates = [days[0]]

    # Normalize size weights to sum to target value
    total_weight = sum(s["size_weight"] for s in specs)
    for i, s in enumerate(specs):
        s["target_value"] = TARGET_TOTAL_VALUE * s["size_weight"] / total_weight
        s["start_value"] = STARTING_VALUE * s["size_weight"] / total_weight
        # Ensure at least one symphony starts at the first date; others are staggered.
        s["invested_since"] = str(onboarding_dates[0] if i == 0 else random.choice(onboarding_dates))

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

        # Choose a realistic lifetime return target first, then anchor the path
        # so day-1 value equals deposits and final value hits the target.
        cum_return_target = random.uniform(0.15, 0.50)
        total_deposits = target / (1 + cum_return_target)

        # Split: ~60% initial funding, remainder in sparse periodic deposits.
        initial_pct = random.uniform(0.50, 0.70)
        initial_deposit = total_deposits * initial_pct
        remaining_deposits = total_deposits - initial_deposit

        # Daily returns with positive drift.
        mean_ret = random.uniform(0.0003, 0.0008)
        std_ret = random.uniform(0.008, 0.016)
        rets = random_walk(n, mean=mean_ret, std=std_ret,
                           regime_prob=0.015, regime_mean=-0.005, regime_std=0.02)
        rets[0] = 0.0

        growth = np.cumprod(1 + rets)
        desired_final_growth = target / max(initial_deposit, 1e-9)
        drift_adjust = np.exp(np.linspace(
            0.0, math.log(desired_final_growth / max(growth[-1], 1e-9)), n
        ))
        values = initial_deposit * growth * drift_adjust

        # Keep returns consistent with the anchored value path.
        rets = np.zeros(n)
        rets[1:] = values[1:] / values[:-1] - 1.0

        # Build deposit array and net_deps
        deposit_events = np.zeros(n)
        deposit_events[0] = initial_deposit
        if n > 1 and remaining_deposits > 0:
            # Sparse cadence: biweekly at most (shared account-level schedule).
            contrib_indices = [j for j, d in enumerate(sym_days) if d in global_contrib_dates]
            if not contrib_indices:
                contrib_indices = [n - 1]
            periodic_deposit = remaining_deposits / len(contrib_indices)
            deposit_events[contrib_indices] = periodic_deposit
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
        sigma = bps_range / 10000
        # Log-space noise centered at 0 avoids persistent down-bias from
        # multiplicative arithmetic-return compounding.
        log_drift = np.random.normal(0, sigma, n)
        log_drift[0] = 0.0
        cum_drift = np.exp(np.cumsum(log_drift))
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

    # 5. Transactions (enough volume for pagination in power profile)
    print("  Inserting Transactions...")
    db.query(Transaction).filter_by(account_id=TEST_ACCOUNT_ID).delete()
    all_tickers = TICKER_POOL[:NUM_TICKERS]
    tx_target = max(20, min(250, NUM_SYMPHONIES * 8))
    if NUM_SYMPHONIES >= 20:
        tx_target = max(tx_target, 120)
    for i in range(tx_target):
        # Spread orders across the available timeline with slight day jitter.
        base_idx = int(i * (len(days) - 1) / max(tx_target - 1, 1))
        jitter = random.randint(-2, 2)
        day_idx = max(0, min(len(days) - 1, base_idx + jitter))
        tx_date = days[day_idx]

        action = "buy" if random.random() < 0.55 else "sell"
        quantity = round(random.uniform(1, 250), 4)
        price = round(random.uniform(10, 600), 2)
        total_amount = round(quantity * price, 2)
        db.add(Transaction(
            account_id=TEST_ACCOUNT_ID,
            date=tx_date,
            symbol=random.choice(all_tickers),
            action=action,
            quantity=quantity,
            price=price,
            total_amount=total_amount,
            order_id=f"test-order-{date_to_epoch_day(tx_date)}-{i:05d}",
        ))
    db.flush()

    # 6. HoldingsHistory (latest date, profile-sized ticker set)
    print("  Inserting HoldingsHistory...")
    db.query(HoldingsHistory).filter_by(account_id=TEST_ACCOUNT_ID).delete()
    latest_date = days[-1]
    for t in all_tickers:
        db.add(HoldingsHistory(
            account_id=TEST_ACCOUNT_ID,
            date=latest_date,
            symbol=t,
            quantity=round(random.uniform(10, 500), 2),
        ))
    db.flush()

    # 7. SymphonyDailyPortfolio + SymphonyDailyMetrics
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

    # 8. SymphonyAllocationHistory (latest date per symphony)
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

    # 9. SymphonyBacktestCache
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

    # 10. SymphonyCatalogEntry
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

    # 11. SyncState
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
    parser.add_argument("--profile", choices=sorted(PROFILE_CONFIGS.keys()), default="power",
                        help="Synthetic persona profile to seed (default: power)")
    parser.add_argument("--seed", type=int, default=None,
                        help="Override deterministic random seed")
    parser.add_argument("--end-date", default=None,
                        help="Optional fixed end date (YYYY-MM-DD) for deterministic timelines")
    parser.add_argument("--purge", action="store_true", help="Remove all test data")
    parser.add_argument("--force", action="store_true",
                        help="Allow operations on non-test DB (disabled by default)")
    args = parser.parse_args()

    _apply_profile(args.profile)
    _ensure_safe_target_db(args.force)

    end_dt = None
    if args.end_date:
        end_dt = _parse_iso_date(args.end_date)

    init_db()

    if args.purge:
        purge_test_data()
    else:
        # Purge first to avoid duplicates
        purge_test_data()
        generate_data(seed=args.seed, end_date=end_dt)
