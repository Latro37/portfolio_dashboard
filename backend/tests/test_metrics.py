"""Unit tests for decomposed metric functions in app.services.metrics."""

import math
from datetime import date, timedelta

import pytest

from app.services.metrics import (
    compute_daily_returns,
    compute_cumulative_return,
    compute_twr,
    compute_mwr,
    compute_cagr,
    compute_annualized_return,
    compute_annualized_return_cumulative,
    compute_drawdown,
    compute_drawdown_stats,
    compute_volatility,
    compute_sharpe,
    compute_sortino,
    compute_calmar,
    compute_win_loss,
    compute_all_metrics,
    compute_latest_metrics,
    compute_performance_series,
)


# =====================================================================
# compute_daily_returns
# =====================================================================

class TestComputeDailyReturns:
    def test_first_element_is_zero(self, simple_series):
        rets = compute_daily_returns(simple_series["pv"], simple_series["deposits"])
        assert rets[0] == 0.0

    def test_steady_growth(self, simple_series):
        rets = compute_daily_returns(simple_series["pv"], simple_series["deposits"])
        for r in rets[1:]:
            assert r == pytest.approx(0.01, abs=1e-6)

    def test_deposit_adjusted(self, deposit_series):
        """On the deposit day, the return should strip out the deposit amount."""
        rets = compute_daily_returns(deposit_series["pv"], deposit_series["deposits"])
        # Day 5: prev_value * (1+r) + deposit = new_value
        # The deposit ($5,000) is subtracted before computing return, so
        # rets[5] = (new_val - prev_val - deposit_change) / prev_val
        prev_val = deposit_series["pv"][4]
        new_val = deposit_series["pv"][5]
        dep_change = deposit_series["deposits"][5] - deposit_series["deposits"][4]
        expected = (new_val - prev_val - dep_change) / prev_val
        assert rets[5] == pytest.approx(expected, abs=1e-8)

    def test_flat_returns_zero(self, flat_series):
        rets = compute_daily_returns(flat_series["pv"], flat_series["deposits"])
        assert all(r == 0.0 for r in rets)

    def test_handles_zero_pv(self):
        pv = [0.0, 100.0]
        deps = [0.0, 100.0]
        rets = compute_daily_returns(pv, deps)
        assert rets[1] == 0.0  # can't compute return from zero base


# =====================================================================
# compute_cumulative_return
# =====================================================================

class TestComputeCumulativeReturn:
    def test_simple_gain(self):
        assert compute_cumulative_return(11000, 10000) == pytest.approx(0.1)

    def test_simple_loss(self):
        assert compute_cumulative_return(9000, 10000) == pytest.approx(-0.1)

    def test_zero_deposits(self):
        assert compute_cumulative_return(5000, 0) == 0.0

    def test_breakeven(self):
        assert compute_cumulative_return(10000, 10000) == 0.0


# =====================================================================
# compute_twr
# =====================================================================

class TestComputeTWR:
    def test_steady_1pct(self, simple_series):
        rets = compute_daily_returns(simple_series["pv"], simple_series["deposits"])
        twr = compute_twr(rets)
        expected = (1.01 ** 4) - 1  # 4 days of 1% growth
        assert twr == pytest.approx(expected, rel=1e-4)

    def test_single_day(self):
        assert compute_twr([0.0]) == 0.0

    def test_mixed_returns(self):
        rets = [0.0, 0.05, -0.03, 0.02]
        twr = compute_twr(rets)
        expected = (1.05 * 0.97 * 1.02) - 1
        assert twr == pytest.approx(expected, rel=1e-8)

    def test_flat(self, flat_series):
        rets = compute_daily_returns(flat_series["pv"], flat_series["deposits"])
        assert compute_twr(rets) == 0.0


# =====================================================================
# compute_mwr
# =====================================================================

class TestComputeMWR:
    def test_no_flows(self, simple_series):
        """With no external flows, MWR should be close to simple return."""
        ann, period = compute_mwr(simple_series["dates"], simple_series["pv"], {})
        # Period return ≈ (10406.04 - 10000) / 10000 ≈ 4.06%
        expected_period = (simple_series["pv"][-1] - simple_series["pv"][0]) / simple_series["pv"][0]
        assert period == pytest.approx(expected_period, rel=1e-4)

    def test_with_deposit(self, deposit_series):
        ext_flows = {deposit_series["dates"][5]: 5000.0}
        ann, period = compute_mwr(deposit_series["dates"], deposit_series["pv"], ext_flows)
        # With a deposit, MWR should differ from simple return
        assert period != 0.0
        assert isinstance(ann, float)
        assert isinstance(period, float)

    def test_single_day(self):
        d = [date(2024, 1, 2)]
        assert compute_mwr(d, [10000], {}) == (0.0, 0.0)

    def test_same_date(self):
        d = [date(2024, 1, 2), date(2024, 1, 2)]
        assert compute_mwr(d, [10000, 10100], {}) == (0.0, 0.0)

    def test_annualization(self):
        """A 10% return over 365 days should annualize to ~10%."""
        d0 = date(2024, 1, 1)
        d1 = d0 + timedelta(days=365)
        ann, period = compute_mwr([d0, d1], [10000, 11000], {})
        assert period == pytest.approx(0.1, rel=1e-4)
        assert ann == pytest.approx(0.1, rel=1e-2)


# =====================================================================
# compute_cagr
# =====================================================================

class TestComputeCAGR:
    def test_doubling_in_two_years(self):
        days = int(365.25 * 2)
        cagr = compute_cagr(10000, 20000, days)
        assert cagr == pytest.approx(0.4142, rel=1e-2)  # sqrt(2) - 1

    def test_no_growth(self):
        assert compute_cagr(10000, 10000, 365) == 0.0

    def test_zero_days(self):
        assert compute_cagr(10000, 20000, 0) == 0.0

    def test_zero_start(self):
        assert compute_cagr(0, 10000, 365) == 0.0

    def test_extreme_growth_remains_finite(self):
        cagr = compute_cagr(1.0, 1e300, 1)
        assert math.isfinite(cagr)
        assert cagr > 0.0


# =====================================================================
# compute_annualized_return
# =====================================================================

class TestComputeAnnualizedReturn:
    def test_one_year(self):
        # 10% return over exactly 1 year → compound annualized ≈ 10%
        result = compute_annualized_return(0.10, 365)
        assert result == pytest.approx(10.0, rel=0.02)

    def test_half_year(self):
        # 5% return over half a year → compound annualized ≈ 10.25%
        result = compute_annualized_return(0.05, 183)
        assert result == pytest.approx(10.25, rel=0.05)

    def test_zero_days(self):
        assert compute_annualized_return(0.10, 0) == 0.0

    def test_floor_when_return_is_minus_100pct_or_worse(self):
        assert compute_annualized_return(-1.0, 365) == -100.0
        assert compute_annualized_return(-1.25, 365) == -100.0

    def test_extreme_growth_remains_finite(self):
        result = compute_annualized_return(1e300, 1)
        assert math.isfinite(result)
        assert result > 0.0

    def test_compound_not_linear(self):
        # 26% return over 195 days (~0.534 years)
        # Linear would give: 26 / 0.534 ≈ 48.7%
        # Compound gives: (1.26)^(1/0.534) - 1 ≈ 54.3%
        result = compute_annualized_return(0.26, 195)
        assert result > 52.0   # must be higher than linear ~48.7%
        assert result < 57.0
        # Verify it matches the compound formula exactly
        years = 195 / 365.25
        expected = ((1.26) ** (1 / years) - 1) * 100
        assert result == pytest.approx(expected, rel=1e-6)

    def test_doubling_in_half_year(self):
        # 100% return in 183 days → compound annualized = (2.0)^(365.25/183) - 1 ≈ 300%+
        result = compute_annualized_return(1.0, 183)
        years = 183 / 365.25
        expected = ((2.0) ** (1 / years) - 1) * 100
        assert result == pytest.approx(expected, rel=1e-6)


# =====================================================================
# compute_annualized_return_cumulative
# =====================================================================

class TestComputeAnnualizedReturnCumulative:
    def test_one_year(self):
        # 10% cumulative return over exactly 1 year → annualized ≈ 10%
        result = compute_annualized_return_cumulative(0.10, 365)
        assert result == pytest.approx(10.0, rel=0.02)

    def test_half_year(self):
        # 5% cumulative return over half a year → annualized ≈ 10.25%
        result = compute_annualized_return_cumulative(0.05, 183)
        assert result == pytest.approx(10.25, rel=0.05)

    def test_zero_days(self):
        assert compute_annualized_return_cumulative(0.10, 0) == 0.0

    def test_floor_when_return_is_minus_100pct_or_worse(self):
        assert compute_annualized_return_cumulative(-1.0, 365) == -100.0
        assert compute_annualized_return_cumulative(-1.8, 365) == -100.0

    def test_extreme_growth_remains_finite(self):
        result = compute_annualized_return_cumulative(1e300, 1)
        assert math.isfinite(result)
        assert result > 0.0

    def test_matches_formula(self):
        # 15% cumulative return over 200 days
        result = compute_annualized_return_cumulative(0.15, 200)
        years = 200 / 365.25
        expected = ((1.15) ** (1 / years) - 1) * 100
        assert result == pytest.approx(expected, rel=1e-6)

    def test_same_math_as_twr_version(self):
        # Both functions use identical math, just different semantic inputs
        result_twr = compute_annualized_return(0.20, 300)
        result_cum = compute_annualized_return_cumulative(0.20, 300)
        assert result_twr == pytest.approx(result_cum, rel=1e-10)


# =====================================================================
# compute_drawdown
# =====================================================================

class TestComputeDrawdown:
    def test_known_drawdown(self, drawdown_series):
        max_dd, cur_dd = compute_drawdown(drawdown_series["pv"])
        # Peak is 12,000, trough is 9,600 → max_dd = (9600/12000 - 1) = -0.20
        assert max_dd == pytest.approx(-0.20, abs=1e-6)
        # Final value 12,500 is above peak 12,000 → current_dd = 0.0 (or slightly positive)
        assert cur_dd >= 0.0 or cur_dd == pytest.approx(0.0, abs=1e-6)

    def test_no_drawdown(self, simple_series):
        """Monotonically rising series should have zero drawdown."""
        max_dd, cur_dd = compute_drawdown(simple_series["pv"])
        assert max_dd == 0.0
        assert cur_dd == 0.0

    def test_flat(self, flat_series):
        max_dd, cur_dd = compute_drawdown(flat_series["pv"])
        assert max_dd == 0.0
        assert cur_dd == 0.0

    def test_empty(self):
        assert compute_drawdown([]) == (0.0, 0.0)

    def test_current_in_drawdown(self):
        """Series ending below peak should have negative current_dd."""
        pv = [100.0, 110.0, 105.0]
        max_dd, cur_dd = compute_drawdown(pv)
        assert cur_dd == pytest.approx(105.0 / 110.0 - 1, abs=1e-6)
        assert cur_dd < 0


# =====================================================================
# compute_drawdown_stats
# =====================================================================

class TestComputeDrawdownStats:
    def test_known_drawdown_stats(self, drawdown_series):
        """Series: 10k → 12k → 9.6k → 12.5k — one drawdown episode of 20%."""
        stats = compute_drawdown_stats(drawdown_series["pv"])
        # Single drawdown trough: -20%
        assert stats["median_drawdown"] == pytest.approx(-0.20, abs=1e-2)
        assert stats["longest_drawdown_days"] > 0
        assert stats["median_drawdown_days"] > 0

    def test_no_drawdown(self, simple_series):
        """Monotonically rising series should have zero median drawdown and zero duration."""
        stats = compute_drawdown_stats(simple_series["pv"])
        assert stats["median_drawdown"] == 0.0
        assert stats["longest_drawdown_days"] == 0
        assert stats["median_drawdown_days"] == 0

    def test_multiple_drawdowns(self):
        """Two distinct drawdown episodes."""
        pv = [100, 110, 105, 112, 100, 115]
        stats = compute_drawdown_stats(pv)
        # Episode 1: peak 110, trough 105 → -4.55% (1 day)
        # Episode 2: peak 112, trough 100 → -10.71% (1 day)
        # Median of [-4.55%, -10.71%] = one of them (2 elements)
        assert stats["median_drawdown"] < 0
        assert stats["longest_drawdown_days"] >= 1
        assert stats["median_drawdown_days"] >= 1

    def test_ongoing_drawdown(self):
        """Series ending in a drawdown should still count it."""
        pv = [100, 110, 95]
        stats = compute_drawdown_stats(pv)
        assert stats["median_drawdown"] == pytest.approx((95 / 110 - 1), abs=1e-6)
        assert stats["longest_drawdown_days"] == 1
        assert stats["median_drawdown_days"] == 1

    def test_empty_and_short(self):
        assert compute_drawdown_stats([])["median_drawdown"] == 0.0
        assert compute_drawdown_stats([100])["longest_drawdown_days"] == 0
        assert compute_drawdown_stats([100])["median_drawdown_days"] == 0

    def test_flat_series(self, flat_series):
        stats = compute_drawdown_stats(flat_series["pv"])
        assert stats["median_drawdown"] == 0.0
        assert stats["longest_drawdown_days"] == 0
        assert stats["median_drawdown_days"] == 0


# =====================================================================
# compute_volatility
# =====================================================================

class TestComputeVolatility:
    def test_known_volatility(self):
        # 4 daily returns of +1%, annualized
        import numpy as np
        rets = [0.01, 0.01, 0.01, 0.01]
        vol = compute_volatility(rets)
        expected = float(np.std(rets, ddof=1)) * math.sqrt(252)
        assert vol == pytest.approx(expected, rel=1e-6)

    def test_flat_zero(self):
        # All zeros are filtered out as non-trading days → too few returns
        assert compute_volatility([0.0, 0.0, 0.0]) == 0.0

    def test_too_few_returns(self):
        assert compute_volatility([0.01]) == 0.0
        assert compute_volatility([]) == 0.0

    def test_excludes_non_trading_days(self):
        """Zero-return (weekend/holiday) days should be excluded from vol."""
        import numpy as np
        trading_rets = [0.02, -0.01, 0.015, -0.005]
        # Mix in weekend zeros — vol should be the same as trading-only
        mixed = [0.02, 0.0, 0.0, -0.01, 0.015, 0.0, 0.0, -0.005]
        vol_clean = compute_volatility(trading_rets)
        vol_mixed = compute_volatility(mixed)
        assert vol_clean == pytest.approx(vol_mixed, rel=1e-6)
        # And both should match the numpy calculation on trading returns only
        expected = float(np.std(trading_rets, ddof=1)) * math.sqrt(252)
        assert vol_mixed == pytest.approx(expected, rel=1e-6)


# =====================================================================
# compute_sharpe
# =====================================================================

class TestComputeSharpe:
    def test_zero_vol_returns_zero(self):
        assert compute_sharpe([0.01, 0.01, 0.01], 0.0002) == 0.0

    def test_positive_excess(self):
        rets = [0.02, -0.005, 0.015, 0.01, -0.002]
        sharpe = compute_sharpe(rets, 0.0002)
        assert sharpe > 0  # positive mean excess, positive Sharpe

    def test_too_few(self):
        assert compute_sharpe([0.01], 0.0002) == 0.0

    def test_with_rf_zero(self):
        rets = [0.01, 0.02, -0.005, 0.015]
        sharpe = compute_sharpe(rets, 0.0)
        assert isinstance(sharpe, float)

    def test_excludes_non_trading_days(self):
        """Weekend zeros should not affect Sharpe."""
        trading_rets = [0.02, -0.005, 0.015, 0.01, -0.002]
        mixed = [0.02, 0.0, -0.005, 0.015, 0.0, 0.01, -0.002, 0.0]
        sharpe_clean = compute_sharpe(trading_rets, 0.0002)
        sharpe_mixed = compute_sharpe(mixed, 0.0002)
        assert sharpe_clean == pytest.approx(sharpe_mixed, rel=1e-6)


# =====================================================================
# compute_sortino
# =====================================================================

class TestComputeSortino:
    def test_no_downside(self):
        """All positive returns → no downside deviation → 0."""
        assert compute_sortino([0.01, 0.02, 0.015], 0.0) == 0.0

    def test_with_downside(self):
        rets = [0.02, -0.01, 0.015, -0.005, 0.01]
        sortino = compute_sortino(rets, 0.0002)
        assert isinstance(sortino, float)
        assert sortino > 0  # positive mean excess, positive Sortino

    def test_too_few(self):
        assert compute_sortino([0.01], 0.0002) == 0.0

    def test_excludes_non_trading_days(self):
        """Weekend zeros should not affect Sortino."""
        trading_rets = [0.02, -0.01, 0.015, -0.005, 0.01]
        mixed = [0.02, 0.0, -0.01, 0.015, 0.0, -0.005, 0.01, 0.0]
        sortino_clean = compute_sortino(trading_rets, 0.0002)
        sortino_mixed = compute_sortino(mixed, 0.0002)
        assert sortino_clean == pytest.approx(sortino_mixed, rel=1e-6)

    def test_rlpm_not_std(self):
        """Downside deviation must use RLPM₂ (no mean subtraction), not np.std.

        RLPM₂ = sqrt(sum(min(r-T,0)²) / N)
        np.std would subtract the mean first, understating downside risk.
        """
        rets = [0.02, -0.01, 0.015, -0.005, 0.01]
        rf = 0.0002
        N = len(rets)
        # Compute expected RLPM₂ manually
        downside_sq = [min(r - rf, 0) ** 2 for r in rets]
        expected_dd = math.sqrt(sum(downside_sq) / N)
        excess_mean = sum(r - rf for r in rets) / N
        expected_sortino = excess_mean / expected_dd * math.sqrt(252)
        result = compute_sortino(rets, rf)
        assert result == pytest.approx(expected_sortino, rel=1e-6)

        # Verify it does NOT equal what np.std would give
        import numpy as np
        downside_arr = [min(r - rf, 0) for r in rets]
        std_based_dd = float(np.std(downside_arr, ddof=1))
        std_based_sortino = excess_mean / std_based_dd * math.sqrt(252)
        assert result != pytest.approx(std_based_sortino, rel=0.01)


# =====================================================================
# compute_calmar
# =====================================================================

class TestComputeCalmar:
    def test_basic(self):
        # 20% annualized / 10% max drawdown = 2.0
        assert compute_calmar(20.0, -10.0) == pytest.approx(2.0)

    def test_zero_drawdown(self):
        assert compute_calmar(20.0, 0.0) == 0.0

    def test_negative_return(self):
        # -5% annualized / 20% drawdown = -0.25
        assert compute_calmar(-5.0, -20.0) == pytest.approx(-0.25)


# =====================================================================
# compute_win_loss
# =====================================================================

class TestComputeWinLoss:
    def test_basic(self):
        rets = [0.01, -0.005, 0.02, 0.0, -0.01]  # 2 wins, 2 losses, 1 flat
        wl = compute_win_loss(rets)
        assert wl["num_wins"] == 2
        assert wl["num_losses"] == 2
        assert wl["win_rate"] == pytest.approx(0.5)  # 2 / (2+2), flat excluded
        assert wl["best_day"] == 0.02
        assert wl["worst_day"] == -0.01
        assert wl["profit_factor"] > 0

    def test_all_wins(self):
        wl = compute_win_loss([0.01, 0.02, 0.005])
        assert wl["num_wins"] == 3
        assert wl["num_losses"] == 0
        assert wl["win_rate"] == pytest.approx(1.0)
        assert wl["profit_factor"] == 0.0  # no losses denominator

    def test_empty(self):
        wl = compute_win_loss([])
        assert wl["num_wins"] == 0
        assert wl["num_losses"] == 0
        assert wl["win_rate"] == 0.0

    def test_avg_win_loss(self):
        rets = [0.02, -0.01]
        wl = compute_win_loss(rets)
        assert wl["avg_win"] == pytest.approx(0.02)
        assert wl["avg_loss"] == pytest.approx(-0.01)

    def test_profit_factor(self):
        rets = [0.03, -0.01]
        wl = compute_win_loss(rets)
        assert wl["profit_factor"] == pytest.approx(3.0)


# =====================================================================
# compute_all_metrics (end-to-end)
# =====================================================================

class TestComputeAllMetrics:
    def test_empty_input(self):
        assert compute_all_metrics([], []) == []

    def test_output_shape(self, simple_series):
        results = compute_all_metrics(simple_series["daily_rows"], simple_series["cash_flows"])
        assert len(results) == 5
        expected_keys = {
            "date", "daily_return_pct", "total_return_dollars", "cumulative_return_pct",
            "time_weighted_return", "cagr", "annualized_return", "annualized_return_cum",
            "money_weighted_return", "money_weighted_return_period",
            "win_rate", "num_wins", "num_losses", "avg_win_pct", "avg_loss_pct",
            "max_drawdown", "current_drawdown", "median_drawdown", "longest_drawdown_days", "median_drawdown_days",
            "annualized_volatility", "sharpe_ratio", "sortino_ratio", "calmar_ratio",
            "best_day_pct", "worst_day_pct", "profit_factor",
        }
        assert expected_keys.issubset(set(results[-1].keys()))

    def test_first_day_values(self, simple_series):
        results = compute_all_metrics(simple_series["daily_rows"], simple_series["cash_flows"])
        first = results[0]
        assert first["daily_return_pct"] == 0.0
        assert first["time_weighted_return"] == 0.0
        assert first["cumulative_return_pct"] == 0.0

    def test_twr_matches_standalone(self, simple_series):
        results = compute_all_metrics(simple_series["daily_rows"], simple_series["cash_flows"])
        rets = compute_daily_returns(simple_series["pv"], simple_series["deposits"])
        expected_twr = compute_twr(rets)
        assert results[-1]["time_weighted_return"] == pytest.approx(expected_twr * 100, abs=0.01)

    def test_drawdown_matches_standalone(self, drawdown_series):
        results = compute_all_metrics(drawdown_series["daily_rows"], drawdown_series["cash_flows"])
        max_dd, _ = compute_drawdown(drawdown_series["pv"])
        assert results[-1]["max_drawdown"] == pytest.approx(max_dd * 100, abs=0.01)

    def test_steady_growth_metrics(self, simple_series):
        results = compute_all_metrics(simple_series["daily_rows"], simple_series["cash_flows"])
        last = results[-1]
        # All up days → 100% win rate
        assert last["win_rate"] == 100.0
        assert last["num_wins"] == 4
        assert last["num_losses"] == 0
        # No drawdown in monotonic growth
        assert last["max_drawdown"] == 0.0
        assert last["current_drawdown"] == 0.0

    def test_flat_series(self, flat_series):
        results = compute_all_metrics(flat_series["daily_rows"], flat_series["cash_flows"])
        last = results[-1]
        assert last["time_weighted_return"] == 0.0
        assert last["cumulative_return_pct"] == 0.0
        assert last["annualized_volatility"] == 0.0
        assert last["sharpe_ratio"] == 0.0

    def test_invalid_risk_free_rate_does_not_crash(self, simple_series):
        results = compute_all_metrics(
            simple_series["daily_rows"],
            simple_series["cash_flows"],
            risk_free_rate=-1.5,
        )
        last = results[-1]
        assert math.isfinite(last["sharpe_ratio"])
        assert math.isfinite(last["sortino_ratio"])


# =====================================================================
# compute_performance_series (chart helper)
# =====================================================================

class TestComputePerformanceSeries:
    def test_output_shape(self, simple_series):
        results = compute_performance_series(simple_series["daily_rows"], simple_series["cash_flows"])
        assert len(results) == 5
        expected_keys = {
            "date", "portfolio_value", "net_deposits",
            "cumulative_return_pct", "daily_return_pct",
            "time_weighted_return", "money_weighted_return", "current_drawdown",
        }
        assert expected_keys == set(results[0].keys())

    def test_twr_consistency(self, simple_series):
        """TWR in performance series should match standalone compute_twr."""
        perf = compute_performance_series(simple_series["daily_rows"], simple_series["cash_flows"])
        rets = compute_daily_returns(simple_series["pv"], simple_series["deposits"])
        expected = compute_twr(rets) * 100
        assert perf[-1]["time_weighted_return"] == pytest.approx(expected, abs=0.01)

    def test_drawdown_consistency(self, drawdown_series):
        perf = compute_performance_series(drawdown_series["daily_rows"], drawdown_series["cash_flows"])
        # Max drawdown at day 3 (value = 9600, peak = 12000)
        dd_at_day3 = perf[3]["current_drawdown"]
        assert dd_at_day3 == pytest.approx((9600 / 12000 - 1) * 100, abs=0.01)

    def test_empty(self):
        assert compute_performance_series([], []) == []


# =====================================================================
# Cross-validation: verify metrics are internally consistent
# =====================================================================

# =====================================================================
# compute_latest_metrics (incremental)
# =====================================================================

class TestComputeLatestMetrics:
    def test_matches_last_row_of_all_metrics(self, simple_series):
        """compute_latest_metrics should produce the same result as the last row of compute_all_metrics."""
        all_rows = compute_all_metrics(simple_series["daily_rows"], simple_series["cash_flows"])
        latest = compute_latest_metrics(simple_series["daily_rows"], simple_series["cash_flows"])
        assert latest is not None
        for key in all_rows[-1]:
            assert latest[key] == all_rows[-1][key], f"Mismatch on {key}: {latest[key]} != {all_rows[-1][key]}"

    def test_matches_with_deposits(self, deposit_series):
        all_rows = compute_all_metrics(deposit_series["daily_rows"], deposit_series["cash_flows"])
        latest = compute_latest_metrics(deposit_series["daily_rows"], deposit_series["cash_flows"])
        assert latest is not None
        for key in all_rows[-1]:
            assert latest[key] == pytest.approx(all_rows[-1][key], abs=1e-6), f"Mismatch on {key}"

    def test_matches_with_drawdown(self, drawdown_series):
        all_rows = compute_all_metrics(drawdown_series["daily_rows"], drawdown_series["cash_flows"])
        latest = compute_latest_metrics(drawdown_series["daily_rows"], drawdown_series["cash_flows"])
        assert latest is not None
        for key in all_rows[-1]:
            assert latest[key] == pytest.approx(all_rows[-1][key], abs=1e-6), f"Mismatch on {key}"

    def test_empty(self):
        assert compute_latest_metrics([], []) is None


# =====================================================================
# compute_mwr — IRR accuracy
# =====================================================================

class TestComputeMWR_IRR:
    def test_known_irr_no_flows(self):
        """10% return over 1 year with no flows → IRR should be ~10%."""
        d0 = date(2024, 1, 1)
        d1 = d0 + timedelta(days=365)
        ann, period = compute_mwr([d0, d1], [10000.0, 11000.0], {})
        assert ann == pytest.approx(0.1, rel=1e-3)
        assert period == pytest.approx(0.1, rel=1e-3)

    def test_known_irr_with_flow(self):
        """Invest $10k, add $5k at midpoint, end at $16k.
        True IRR should differ from Modified Dietz."""
        d0 = date(2024, 1, 1)
        d_mid = d0 + timedelta(days=183)
        d1 = d0 + timedelta(days=365)
        dates = [d0, d_mid, d1]
        values = [10000.0, 15500.0, 16000.0]  # $5k deposit at midpoint
        flows = {d_mid: 5000.0}
        ann, period = compute_mwr(dates, values, flows)
        # The portfolio gained $1000 on $15k average capital — IRR should be modest
        assert ann > 0
        assert ann < 0.15  # sanity bound

    def test_large_deposit_before_drop(self):
        """Large deposit before a loss should produce lower MWR than TWR."""
        d0 = date(2024, 1, 1)
        d1 = d0 + timedelta(days=100)
        d2 = d0 + timedelta(days=200)
        # Start $10k, deposit $90k on day 100, portfolio drops to $90k on day 200
        dates = [d0, d1, d2]
        values = [10000.0, 100500.0, 90000.0]  # day 1: 10000*1.005 + 90000 deposit
        flows = {d1: 90000.0}
        ann, period = compute_mwr(dates, values, flows)
        # Lost money on $100k base → negative MWR
        assert period < 0

    def test_solver_fallback(self):
        """Edge case: zero-value start should not crash (falls back to Dietz)."""
        d0 = date(2024, 1, 1)
        d1 = d0 + timedelta(days=30)
        # Start at 0, deposit on day 0 isn't in ext_flows, end at 100
        dates = [d0, d1]
        values = [0.0, 100.0]
        flows = {}
        ann, period = compute_mwr(dates, values, flows)
        assert isinstance(ann, float)
        assert isinstance(period, float)


# =====================================================================
# Cross-validation: verify metrics are internally consistent
# =====================================================================

# =====================================================================
# Drawdown — deposit/withdrawal immunity
# =====================================================================

class TestDrawdownCashFlowImmunity:
    def test_withdrawal_not_counted_as_drawdown(self):
        """A withdrawal should NOT appear as a drawdown.

        Scenario: $10k grows to $11k (+10%), then $3k is withdrawn (value drops
        to ~$8.08k).  The investment itself never lost money, so max drawdown
        should be 0% (or very close), not -26%.
        """
        # Day 0: invest $10k
        # Day 1: grows 10% to $11k
        # Day 2: withdraw $3k, portfolio continues to grow 1% → (11000-3000)*1.01 = 8080
        pv  = [10000.0, 11000.0, 8080.0]
        dep = [10000.0, 10000.0, 7000.0]  # net_deposits drops by $3k withdrawal
        rows = [
            {"date": date(2024, 1, 2) + timedelta(days=i), "portfolio_value": pv[i], "net_deposits": dep[i]}
            for i in range(3)
        ]
        results = compute_all_metrics(rows, [{"date": date(2024, 1, 4), "amount": -3000.0}])
        last = results[-1]
        # Investment performance: +10%, then +1% → no drawdown from peak
        # Raw pv would show 8080/11000 - 1 = -26.5%  (WRONG)
        # Equity curve: 1.0 → 1.10 → 1.111 → no drawdown
        assert last["max_drawdown"] == pytest.approx(0.0, abs=0.01)

    def test_deposit_does_not_inflate_drawdown(self):
        """A deposit followed by a small loss should show correct drawdown.

        Scenario: $10k, deposit $10k (now $20k), then lose 5% → $19k.
        Drawdown should be -5%, not based on raw peak.
        """
        pv  = [10000.0, 20000.0, 19000.0]
        dep = [10000.0, 20000.0, 20000.0]
        rows = [
            {"date": date(2024, 1, 2) + timedelta(days=i), "portfolio_value": pv[i], "net_deposits": dep[i]}
            for i in range(3)
        ]
        results = compute_all_metrics(rows, [{"date": date(2024, 1, 3), "amount": 10000.0}])
        last = results[-1]
        # Daily returns: day0=0, day1=(20000-10000-10000)/10000=0%, day2=(19000-20000-0)/20000=-5%
        # Equity curve: 1.0 → 1.0 → 0.95 → drawdown = -5%
        assert last["max_drawdown"] == pytest.approx(-5.0, abs=0.1)


# =====================================================================
# Cross-validation: verify metrics are internally consistent
# =====================================================================

class TestCrossValidation:
    def test_twr_vs_cumulative_no_deposits(self):
        """Without deposits, TWR and cumulative return should match closely."""
        pv = [10000, 10500, 10200, 10800, 11000]
        dep = 10000.0
        rows = [
            {"date": date(2024, 1, 2) + timedelta(days=i), "portfolio_value": float(pv[i]), "net_deposits": dep}
            for i in range(5)
        ]
        results = compute_all_metrics(rows, [])
        last = results[-1]
        # Cum return = (11000 - 10000) / 10000 = 10%
        assert last["cumulative_return_pct"] == pytest.approx(10.0, abs=0.1)
        # TWR should also be ~10% since no deposits
        assert last["time_weighted_return"] == pytest.approx(10.0, abs=0.5)

    def test_calmar_equals_ann_over_dd(self, drawdown_series):
        results = compute_all_metrics(drawdown_series["daily_rows"], drawdown_series["cash_flows"])
        last = results[-1]
        if last["max_drawdown"] != 0:
            expected_calmar = last["annualized_return_cum"] / abs(last["max_drawdown"])
            assert last["calmar_ratio"] == pytest.approx(expected_calmar, abs=0.01)

    def test_perf_series_matches_all_metrics(self, deposit_series):
        """Performance series TWR/drawdown should match compute_all_metrics final row."""
        metrics = compute_all_metrics(deposit_series["daily_rows"], deposit_series["cash_flows"])
        perf = compute_performance_series(deposit_series["daily_rows"], deposit_series["cash_flows"])
        assert metrics[-1]["time_weighted_return"] == pytest.approx(
            perf[-1]["time_weighted_return"], abs=0.01
        )
        assert metrics[-1]["current_drawdown"] == pytest.approx(
            perf[-1]["current_drawdown"], abs=0.01
        )
