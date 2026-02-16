# Portfolio Metrics Reference

This document defines every metric calculated in Portfolio Dashboard and explains the underlying math.

---

## Table of Contents

1. [Core Metrics](#core-metrics)
   - [Daily Return](#1-daily-return)
   - [Cumulative Return](#2-cumulative-return)
   - [Time-Weighted Return (TWR)](#3-time-weighted-return-twr)
   - [Money-Weighted Return (MWR)](#4-money-weighted-return-mwr)
   - [CAGR](#5-cagr-compound-annual-growth-rate)
   - [Annualized Return](#6-annualized-return)
   - [Drawdown (Max & Current)](#7-drawdown-max--current)
   - [Annualized Volatility](#8-annualized-volatility)
   - [Sharpe Ratio](#9-sharpe-ratio)
   - [Sortino Ratio](#10-sortino-ratio)
   - [Calmar Ratio](#11-calmar-ratio)
   - [Win / Loss Statistics](#12-win--loss-statistics)
   - [Profit Factor](#13-profit-factor)
2. [Chart Views](#chart-views)
   - [Account-Level Dashboard](#account-level-dashboard)
   - [Symphony Detail — Live](#symphony-detail--live)
   - [Symphony Detail — Backtest](#symphony-detail--backtest)
3. [Metric Card Layouts](#metric-card-layouts)
4. [Glossary](#glossary)

---

## Core Metrics

### 1. Daily Return

**What it is:** The percentage change in portfolio value from one day to the next, adjusted for any deposits or withdrawals that occurred that day. This isolates the *investment performance* from the effect of adding or removing money.

**Why it matters:** Daily returns are the atomic building block of nearly every other metric. TWR, Sharpe, Sortino, volatility, win rate — all of them are derived from the series of daily returns. Without deposit adjustment, a $10,000 deposit would look like a massive "gain," distorting every downstream calculation.

**How to interpret:** A daily return of +0.5% means the portfolio's *investments* grew by 0.5% that day, regardless of whether you deposited $5,000 or $0.

**Formula:**

```
daily_return[i] = (value[i] - value[i-1] - new_deposit[i]) / value[i-1]

where:
  new_deposit[i] = net_deposits[i] - net_deposits[i-1]
```

**Implementation:** `compute_daily_returns(pv, deposits)` → `List[float]`

```python
# backend/app/services/metrics.py, line 23-38
def compute_daily_returns(pv, deposits):
    returns = [0.0]  # day 0 has no prior
    for i in range(1, len(pv)):
        new_dep = deposits[i] - deposits[i - 1]
        if pv[i - 1] > 0:
            returns.append((pv[i] - pv[i - 1] - new_dep) / pv[i - 1])
        else:
            returns.append(0.0)
    return returns
```

**Stored as:** `daily_return_pct` (percentage, e.g. `0.52` means +0.52%)

**Cash flow timing assumption:** The denominator `value[i-1]` implicitly assumes cash flows arrive at the **end of the day**, so the day's return is earned entirely on the prior-day balance. This is the standard **Simple Dietz** approach for daily-level calculations. CFA GIPS recommends revaluing the portfolio at the time of each significant cash flow, but since Composer's API provides only end-of-day values, this is the best available approximation and matches what most portfolio trackers use with daily data.

---

### 2. Cumulative Return

**What it is:** The total profit or loss expressed as a percentage of what you've put in. It answers: "For every dollar I deposited, how many cents of profit have I made?"

**Why it matters:** Unlike TWR (which measures strategy quality), cumulative return reflects your actual dollar-weighted experience. If you deposited $100,000 and the portfolio is now worth $112,000, your cumulative return is 12% — you made 12 cents on every dollar deposited.

**How to interpret:**
- **Positive:** You're in profit relative to your total deposits
- **Negative:** Your portfolio is worth less than what you put in
- **Differs from TWR** when deposits are made at different times — a large deposit right before a drawdown will drag cumulative return down more than TWR

**Formula:**

```
cumulative_return = (portfolio_value - net_deposits) / net_deposits
```

**Implementation:** `compute_cumulative_return(pv_i, deposits_i)` → `float`

```python
# backend/app/services/metrics.py, line 41-45
def compute_cumulative_return(pv_i, deposits_i):
    if deposits_i > 0:
        return (pv_i - deposits_i) / deposits_i
    return 0.0
```

**Stored as:** `cumulative_return_pct` (percentage)

---

### 3. Time-Weighted Return (TWR)

**What it is:** The compounded growth rate of the portfolio that **removes the effect of cash flows**. It chains together each day's return multiplicatively, so the result reflects pure investment performance regardless of when or how much money was deposited.

**Why it matters:** TWR is the **industry standard** for evaluating investment managers and strategies. The CFA Institute's Global Investment Performance Standards (GIPS) mandate TWR for performance reporting because it isolates strategy skill from the investor's deposit/withdrawal timing. If you want to know "how good is this strategy?", TWR is the answer.

**How to interpret:**
- A TWR of +8% means the strategy grew $1.00 into $1.08 over the period
- Two portfolios running the same strategy will have the same TWR even if one investor deposited $1M on day 1 and the other drip-fed $10K/month
- **Use TWR to compare strategies.** Use MWR/cumulative return to assess your personal experience.

**Benchmarks:** The S&P 500 has historically returned ~10% TWR per year.

**Formula:**

```
TWR = ∏(1 + daily_return[i]) - 1,  for i = 1..n
```

This is "chain-linking" — each day's return is compounded onto the previous total.

**Implementation:** `compute_twr(daily_returns)` → `float`

```python
# backend/app/services/metrics.py, line 48-57
def compute_twr(daily_returns):
    twr = 1.0
    for r in daily_returns[1:]:  # skip day-0 placeholder
        twr *= (1 + r)
    return twr - 1.0
```

**Stored as:** `time_weighted_return` (percentage)

---

### 4. Money-Weighted Return (MWR)

**What it is:** The return that accounts for the **timing and size of your cash flows**. Implemented using the **true Internal Rate of Return (IRR)** solved numerically via Brent's method (`scipy.optimize.brentq`). If the solver fails to converge (rare edge cases), it falls back to the Modified Dietz approximation.

**Why it matters:** MWR reflects the actual investor experience. If you invested heavily before a market rally, your MWR will be higher than TWR. If you deposited a large sum right before a crash, your MWR will be lower. Financial advisors use MWR to show clients their personal rate of return, while TWR evaluates the advisor's strategy selection. Bloomberg, Morningstar, and institutional performance systems all use true IRR for MWR.

**How to interpret:**
- **MWR > TWR:** You timed your deposits well (more money invested during gains)
- **MWR < TWR:** You timed your deposits poorly (more money invested during losses)
- **MWR ≈ TWR:** Your deposits were relatively evenly distributed or small relative to the portfolio

**Formula (True IRR):**

The IRR is the annual rate `r` that satisfies the NPV equation:

```
0 = -V_start × (1+r)^T  -  Σ CF_i × (1+r)^t_i  +  V_end

where:
  T    = total years in the measurement period
  CF_i = cash flow amount on day i
  t_i  = years remaining from flow date to end date

Solve for r using Brent's method (bracket: -0.999 to 10.0)
Period return = (1 + r)^T - 1
```

Unlike the Modified Dietz approximation (which assumes linear returns within the period), true IRR assumes **compounding** — making it more accurate for longer periods and large cash flows.

**Fallback (Modified Dietz):** If Brent's method fails (e.g., no root in the bracket, degenerate inputs), the implementation falls back to Modified Dietz: `MDR = (V_end - V_start - Σ CF_i) / (V_start + Σ(CF_i × W_i))`.

**Implementation:** `compute_mwr(dates_list, pv_list, ext_flows)` → `(annualized, period)`

```python
# backend/app/services/metrics.py
def compute_mwr(dates_list, pv_list, ext_flows):
    # ... setup: d0, dn, years, pv_start, pv_end ...

    # Collect flows within the window
    flows_in_window = []  # (years_remaining, amount)
    for d, amt in ext_flows.items():
        if d0 < d <= dn:
            t = (dn - d).days / 365.25
            flows_in_window.append((t, amt))

    # NPV equation
    def npv(r):
        total = -pv_start * (1 + r) ** years
        for t, amt in flows_in_window:
            total -= amt * (1 + r) ** t
        total += pv_end
        return total

    try:
        irr = brentq(npv, -0.999, 10.0, maxiter=200, xtol=1e-12)
        period_return = (1 + irr) ** years - 1
        return irr, period_return
    except (ValueError, RuntimeError):
        return _modified_dietz(...)  # fallback
```

**Stored as:** `money_weighted_return` (annualized %), `money_weighted_return_period` (period %)

**UI note:** The Dashboard metric card labeled "MWR" displays the **period** return (`money_weighted_return_period`), not the annualized value. This makes it directly comparable to the TWR card, which also shows the period return. Both TWR and MWR use the same time basis so users can compare them side-by-side to gauge deposit timing impact.

---

### 5. CAGR (Compound Annual Growth Rate)

**What it is:** The smoothed annual growth rate that would take the starting portfolio value to the ending value, assuming steady compounding. Unlike TWR, CAGR uses raw portfolio values (not deposit-adjusted returns), so it includes the effect of deposits.

**Why it matters:** CAGR is simple and intuitive — it answers "what steady annual growth rate explains my portfolio going from X to Y?" However, it is **misleading for portfolios with significant cash flows** because a large deposit inflates the ending value, making CAGR artificially high. For this reason, TWR or MWR are generally preferred for portfolios with deposits.

**How to interpret:**
- Useful for comparing against benchmarks like "S&P 500 CAGR of 10%"
- **Unreliable** when deposits are a large percentage of portfolio value
- Best suited for lump-sum, buy-and-hold investments

**Formula:**

```
CAGR = (V_end / V_start) ^ (1 / years) - 1

where:
  years = days_elapsed / 365.25
```

**Implementation:** `compute_cagr(pv_start, pv_end, days_elapsed)` → `float`

```python
# backend/app/services/metrics.py, line 103-108
def compute_cagr(pv_start, pv_end, days_elapsed):
    if days_elapsed <= 0 or pv_start <= 0 or pv_end <= 0:
        return 0.0
    years = days_elapsed / 365.25
    return (pv_end / pv_start) ** (1 / years) - 1
```

**Stored as:** `cagr` (percentage)

---

### 6. Annualized Return (TWR-based)

**What it is:** The Time-Weighted Return compounded to a one-year rate. Converts the cumulative TWR into the equivalent annual growth rate assuming reinvestment.

**Why it matters:** Provides a standardized annual rate from TWR, enabling comparison across periods of different lengths. Because it is based on TWR, it isolates pure strategy performance independent of cash-flow timing — the CFA GIPS standard for comparing fund managers.

**How to interpret:**
- For periods < 1 year: this is an *extrapolation* assuming the same compound growth continues
- For exactly 1 year: equals TWR
- For periods > 1 year: gives the equivalent steady annual compound rate

**Formula:**

```
annualized_return = ((1 + TWR_decimal) ^ (1 / years) - 1) × 100

where:
  years = days_elapsed / 365.25
```

**Implementation:** `compute_annualized_return(twr_decimal, days_elapsed)` → `float`

```python
# backend/app/services/metrics.py
def compute_annualized_return(twr_decimal, days_elapsed):
    if days_elapsed <= 0:
        return 0.0
    years = days_elapsed / 365.25
    return ((1 + twr_decimal) ** (1 / years) - 1) * 100
```

**Stored as:** `annualized_return` (percentage)

---

### 6b. Annualized Return (Cumulative-Return-based)

**What it is:** The cumulative return (profit ÷ net deposits) compounded to a one-year rate. Converts your real-world dollar gain into an equivalent annual growth rate.

**Why it matters:** Users intuitively think of their investment growth as "I deposited X, I now have Y, what annual rate is that?" Basing annualized return on cumulative return directly answers that question. This is the metric shown in the dashboard's **Annualized Return** card.

**How it differs from the TWR-based version:** TWR strips out the impact of cash flow timing — useful for comparing strategies, but doesn't reflect the investor's actual dollar experience. Cumulative return = `(PV − net_deposits) / net_deposits`, so annualizing it gives the intuitive "my money is growing at X% per year."

**Formula:**

```
cum_ret_decimal = (portfolio_value - net_deposits) / net_deposits
annualized_return_cum = ((1 + cum_ret_decimal) ^ (1 / years) - 1) × 100

where:
  years = days_elapsed / 365.25
```

**Implementation:** `compute_annualized_return_cumulative(cum_ret_decimal, days_elapsed)` → `float`

```python
# backend/app/services/metrics.py
def compute_annualized_return_cumulative(cum_ret_decimal, days_elapsed):
    if days_elapsed <= 0:
        return 0.0
    years = days_elapsed / 365.25
    return ((1 + cum_ret_decimal) ** (1 / years) - 1) * 100
```

**Stored as:** `annualized_return_cum` (percentage)

#### Linear vs. Compound Annualization

There are two ways to annualize a cumulative return:

| Method | Formula | Description |
|---|---|---|
| **Linear** (simple average) | `TWR% / years` | Divides the total return evenly across years |
| **Compound** (CAGR-style) | `((1 + TWR)^(1/years) - 1) × 100` | Finds the steady annual rate that, when compounded, reproduces the total return |

This application uses the **compound** method. Here's why the linear method is misleading:

**Example — 100% total return over 5 years:**

| Method | Calculation | Annualized Result |
|---|---|---|
| Linear | `100% / 5` | **20.0%** per year |
| Compound | `(1 + 1.00)^(1/5) - 1` | **14.9%** per year |

If you actually earned a steady 20% per year for 5 years, you'd end up with `1.20^5 = 2.488`, or a **149% return** — far more than 100%. The linear method overstates performance because it ignores the compounding effect: each year's gains generate additional gains in subsequent years. Dividing the total by the number of years effectively double-counts this "growth on growth."

The gap widens with higher returns and longer periods:

| Total Return | Period | Linear | Compound | Overstatement |
|---|---|---|---|---|
| 50% | 2 years | 25.0% | 22.5% | +2.5% |
| 100% | 5 years | 20.0% | 14.9% | +5.1% |
| 300% | 10 years | 30.0% | 14.9% | +15.1% |

The 300% / 10-year case is striking: linear annualization claims 30% per year, but the actual compound rate is only 14.9%. An investor expecting 30% annual growth based on the linear figure would be severely misled — 14.9% compounded for 10 years doubles your money twice (4×), while 30% compounded for 10 years would yield 13.8× growth.

**Rule of thumb:** For short periods (< 1 year) with modest returns, the two methods produce nearly identical results. The divergence becomes material for multi-year periods or returns above ~20%.

---

### 7. Drawdown (Max & Current)

**What it is:** Drawdown measures the decline from a portfolio's peak value to a subsequent trough, computed from the **deposit-adjusted equity curve** (growth of $1 based on TWR daily returns) rather than raw portfolio values. This ensures that deposits and withdrawals are not counted as gains or losses. **Max drawdown** is the largest peak-to-trough decline ever observed in the measurement period. **Current drawdown** measures how far below the all-time peak the portfolio sits right now.

**Why it matters:** Drawdown is the single most important *risk* metric for most investors. While volatility measures daily fluctuation symmetrically, drawdown captures the **pain of losing money** — how bad it actually got. A max drawdown of -30% means that at some point, the portfolio's *investment performance* lost 30% from its peak. This is psychologically and financially significant because:

1. A 30% loss requires a 43% gain just to break even
2. Deep drawdowns test investor discipline — many sell at the bottom
3. Hedge funds and institutional investors often set max drawdown limits (e.g., "shut down if drawdown exceeds -20%")

**How to interpret:**
- **Max drawdown of -10%:** Relatively low risk; typical of conservative strategies
- **Max drawdown of -20% to -30%:** Moderate risk; typical of equity strategies
- **Max drawdown of -50%+:** High risk; occurred in S&P 500 during 2008
- **Current drawdown of 0%:** Portfolio is at its all-time high
- **Current drawdown of -5%:** Portfolio is 5% below its peak

**Formula:**

```
# Build deposit-adjusted equity curve from daily returns
equity[0] = 1.0
equity[i] = equity[i-1] × (1 + daily_return[i])

# Compute drawdown from equity curve (not raw portfolio value)
For each day i:
  peak[i] = max(equity[0], equity[1], ..., equity[i])
  drawdown[i] = (equity[i] / peak[i]) - 1

max_drawdown = min(drawdown[0], drawdown[1], ..., drawdown[n])
current_drawdown = drawdown[n]
```

**Why equity curve, not raw values?** If an investor withdraws $25,000, the raw portfolio value drops — but the *investments* didn't lose money. Using the deposit-adjusted equity curve (which strips out cash flows via daily returns) ensures that only actual investment losses appear as drawdowns.

**Implementation:** `compute_drawdown(equity_series)` → `(max_dd, current_dd)`

The `_compute_row` function in `compute_all_metrics` builds the equity curve from daily returns before passing it to `compute_drawdown`:

```python
# backend/app/services/metrics.py — inside _compute_row
equity = [1.0]
for r in daily_rets[1 : i + 1]:
    equity.append(equity[-1] * (1 + r))
max_dd, cur_dd = compute_drawdown(equity)
```

**Stored as:** `max_drawdown` (percentage, negative), `current_drawdown` (percentage, negative)

#### Median Drawdown

**What it is:** The median of all drawdown episode troughs. A drawdown episode begins when the equity curve drops below its running peak and ends when it recovers to a new peak. Each episode's trough (deepest point) is recorded, and the median gives the "typical" drawdown depth.

**Why it matters:** Max drawdown captures the single worst episode, but median drawdown gives a more representative picture of typical pain, without being skewed by outliers as an arithmetic mean would be. A strategy with a -30% max drawdown but -5% median drawdown had one bad event in an otherwise stable history. A strategy with -30% max and -20% median is consistently painful. Institutional risk managers (per CFA GIPS and hedge fund due diligence standards) often review median/average drawdown alongside max drawdown for a fuller risk profile.

**Formula:**

```
For each drawdown episode (peak → trough → recovery):
  trough_i = min(equity[j] / peak - 1)  over the episode

median_drawdown = median(trough_1, trough_2, ..., trough_k)
```

**Implementation:** `compute_drawdown_stats(equity_series)` → `{"median_drawdown": float, "longest_drawdown_days": int, "median_drawdown_days": int}`

**Stored as:** `median_drawdown` (percentage, negative)

#### Longest Drawdown

**What it is:** The longest drawdown episode measured in trading days — i.e., the maximum number of consecutive days the equity curve stayed below its prior peak before recovering.

**Why it matters:** Duration matters as much as depth. A -10% drawdown that lasts 2 days is far less painful than a -10% drawdown that drags on for 6 months. Long drawdown durations test investor patience and can lead to capitulation. This metric is commonly used in quantitative strategy evaluation (e.g., QuantConnect, Quantopian) alongside max drawdown.

**Formula:**

```
For each drawdown episode:
  length_i = number of days from first drop below peak to recovery

longest_drawdown_days = max(length_1, length_2, ..., length_k)
```

**Stored as:** `longest_drawdown_days` (integer, trading days)

#### Median Drawdown Length

**What it is:** The median duration (in trading days) across all drawdown episodes. While longest drawdown captures the worst-case recovery time, median drawdown length reflects the typical episode duration.

**Why it matters:** A strategy with a long worst-case drawdown but short median drawdown recovers quickly most of the time. Conversely, a high median drawdown length indicates the strategy frequently stays underwater for extended periods, which is psychologically taxing.

**Formula:**

```
For each drawdown episode:
  length_i = number of days from first drop below peak to recovery

median_drawdown_days = median(length_1, length_2, ..., length_k)
```

**Stored as:** `median_drawdown_days` (integer, trading days)

---

### 8. Annualized Volatility

**What it is:** The standard deviation of daily returns, scaled to an annual figure by multiplying by √252 (the square root of the number of trading days in a year). It measures how much daily returns fluctuate around their mean.

**Why it matters:** Volatility quantifies **uncertainty**. A strategy with 10% annualized volatility has much more predictable daily returns than one with 40%. However, volatility treats upside and downside moves equally — a strategy that occasionally shoots up 5% in a day is penalized the same as one that drops 5%. This symmetry is a known limitation, which is why Sortino ratio exists as a complement.

**How to interpret:**
- **< 10%:** Very low volatility (bonds, money market)
- **10-20%:** Moderate (diversified equity portfolios, S&P 500 ≈ 15%)
- **20-40%:** High (individual stocks, leveraged strategies)
- **> 40%:** Extreme (crypto, 3x leveraged ETFs)

**Why √252?** Returns are assumed to be independent and identically distributed. Under this assumption, the variance of a sum of N independent variables is N times the variance of one. So annual variance = 252 × daily variance, and annual std dev = √252 × daily std dev. This is a simplification — real returns exhibit autocorrelation and fat tails — but it's the industry standard.

**Trading days only:** Non-trading days (weekends and holidays) where the portfolio value is unchanged produce a 0.0% daily return. These are **excluded** before computing standard deviation. Including them would artificially reduce measured volatility (more data points clustered at zero) while still annualizing with √252, which assumes each data point is a trading day. This matches the standard practice used by Bloomberg, Morningstar, and CFA Institute — volatility is computed from trading-day returns only and annualized with √252 (the approximate number of US equity trading days per year).

**Formula:**

```
trading_returns = [r for r in daily_returns if r ≠ 0.0]
volatility = std_dev(trading_returns, ddof=1) × √252
```

**Implementation:** `compute_volatility(daily_returns)` → `float`

```python
# backend/app/services/metrics.py
def compute_volatility(daily_returns):
    trading = [r for r in daily_returns if r != 0.0]
    if len(trading) < 2:
        return 0.0
    vol = float(np.std(trading, ddof=1))
    return vol * math.sqrt(252)
```

**Stored as:** `annualized_volatility` (percentage)

---

### 9. Sharpe Ratio

**What it is:** The most widely used risk-adjusted performance metric. It measures excess return (above the risk-free rate) per unit of total volatility. Developed by Nobel laureate William Sharpe in 1966.

**Why it matters:** Raw returns alone don't tell you if a strategy is good. A 20% return with 5% volatility is far more impressive than 20% with 40% volatility. The Sharpe ratio normalizes return by risk, enabling apples-to-apples comparison across strategies with different risk profiles.

**How to interpret:**
- **< 0:** The strategy underperformed the risk-free rate (e.g., T-bills)
- **0 to 0.5:** Poor risk-adjusted performance
- **0.5 to 1.0:** Acceptable
- **1.0 to 2.0:** Good (most successful hedge funds)
- **> 2.0:** Excellent (but verify — could indicate overfitting or look-ahead bias in backtests)
- **> 3.0:** Exceptional (rare; check for data errors)

**Limitations:**
- Assumes returns are normally distributed (they aren't — fat tails exist)
- Treats upside volatility as equally bad as downside volatility
- Sensitive to the measurement period — a strategy with one great month can skew the Sharpe
- Use **Sortino ratio** if you only care about downside risk

**Formula:**

```
trading_returns = [r for r in daily_returns if r ≠ 0.0]
Sharpe = mean(trading_returns - rf_daily) / std_dev(trading_returns) × √252

where:
  rf_daily = (1 + annual_risk_free_rate) ^ (1/252) - 1
```

The risk-free rate defaults to 5% annually (current approximate T-bill yield).

Non-trading days are excluded for the same reasons as volatility (see above). Including weekend zeros would drag the mean excess return negative (0 − rf_daily < 0 on each flat day) and reduce standard deviation, producing a Sharpe ratio that reflects calendar-day dilution rather than actual trading performance.

**Implementation:** `compute_sharpe(daily_returns, rf_daily)` → `float`

```python
# backend/app/services/metrics.py
def compute_sharpe(daily_returns, rf_daily):
    trading = [r for r in daily_returns if r != 0.0]
    if len(trading) < 2:
        return 0.0
    vol = float(np.std(trading, ddof=1))
    if vol <= 0:
        return 0.0
    excess = [r - rf_daily for r in trading]
    return float(np.mean(excess)) / vol * math.sqrt(252)
```

**Stored as:** `sharpe_ratio` (dimensionless)

---

### 10. Sortino Ratio

**What it is:** A variation of the Sharpe ratio that only penalizes **downside volatility**. Instead of dividing excess return by total standard deviation, it divides by the standard deviation of negative returns only. Developed by Frank Sortino.

**Why it matters:** Most investors don't mind upside volatility — if a portfolio jumps +5% in a day, that's great. The Sharpe ratio punishes this equally with a -5% day. The Sortino ratio fixes this asymmetry by only measuring downside deviation. It's particularly valuable for strategies with skewed return distributions (e.g., trend-following strategies that have occasional large up-moves).

**How to interpret:**
- Same general scale as Sharpe, but typically higher because the denominator is smaller
- **> 2.0:** Strong downside-adjusted performance
- A strategy with Sortino >> Sharpe has a positively skewed return distribution (more big up days than big down days)
- A strategy with Sortino ≈ Sharpe has roughly symmetric returns

**Formula:**

```
trading_returns = [r for r in daily_returns if r ≠ 0.0]
Sortino = mean(trading_returns - rf_daily) / TDD × √252

where:
  TDD = sqrt( sum(min(r_i - rf_daily, 0)²) / N )
  N   = total number of trading days (not just below-target days)
```

Only below-target excess returns contribute to the TDD. Returns above the target contribute 0² = 0 to the sum, but are still counted in N — this means strategies that rarely underperform the target have lower TDD.

As with volatility and Sharpe, non-trading days (0.0% return) are excluded so that only actual trading-day downside risk is measured.

**Downside deviation method:** The denominator uses the **target downside deviation** (TDD), also called the second-order root lower partial moment (RLPM₂):

```
TDD = sqrt( sum(min(r_i - T, 0)²) / N )
```

where T is the target return (rf_daily) and N is the total number of trading days (not just the negative ones). This is the formula specified by Sortino & van der Meer (1991) and used by the CFA Institute’s CIPM (Certificate in Investment Performance Measurement) programme.

**Why not `std()` of negative returns?** A common but incorrect shortcut uses `np.std(min(r-T, 0))`, which subtracts the mean of the downside array before squaring. This understates downside deviation (and thus overstates the Sortino ratio) because: (1) the mean of the downside array is negative, so subtracting it reduces each squared deviation, and (2) it treats the frequency of below-target returns differently than the original formulation. The RLPM₂ formula does NOT subtract the mean — it directly measures the root-mean-square of below-target deviations.

**Implementation:** `compute_sortino(daily_returns, rf_daily)` → `float`

```python
# backend/app/services/metrics.py
def compute_sortino(daily_returns, rf_daily):
    trading = [r for r in daily_returns if r != 0.0]
    if len(trading) < 2:
        return 0.0
    downside_sq = [min(r - rf_daily, 0) ** 2 for r in trading]
    downside_dev = math.sqrt(sum(downside_sq) / len(trading))
    if downside_dev <= 0:
        return 0.0
    excess_mean = float(np.mean([r - rf_daily for r in trading]))
    return excess_mean / downside_dev * math.sqrt(252)
```

**Stored as:** `sortino_ratio` (dimensionless)

---

### 11. Calmar Ratio

**What it is:** The ratio of annualized return to maximum drawdown. It measures how much return you earn per unit of worst-case pain. Originally designed for evaluating hedge fund and CTA (Commodity Trading Advisor) performance.

**Why it matters:** While Sharpe uses volatility (daily noise) as the risk denominator, Calmar uses max drawdown (the worst actual loss). This makes Calmar more meaningful for investors who think about risk in terms of "how much can I lose?" rather than "how much do daily returns wiggle?" A strategy that returns 20% per year with a max drawdown of -10% (Calmar = 2.0) is far more attractive than one that returns 20% with a max drawdown of -40% (Calmar = 0.5).

**How to interpret:**
- **< 0.5:** Poor — the max drawdown was disproportionately large relative to returns
- **0.5 to 1.0:** Acceptable
- **1.0 to 2.0:** Good
- **> 2.0:** Excellent — strong returns with controlled drawdowns
- **> 5.0:** Exceptional (often only seen in short measurement periods or low-volatility strategies)

**Formula:**

```
Calmar = annualized_return / |max_drawdown|

Both inputs are in the same unit (percentages).
```

**Implementation:** `compute_calmar(annualized_return_pct, max_drawdown_pct)` → `float`

```python
# backend/app/services/metrics.py, line 180-188
def compute_calmar(annualized_return_pct, max_drawdown_pct):
    abs_dd = abs(max_drawdown_pct)
    if abs_dd <= 0:
        return 0.0
    return annualized_return_pct / abs_dd
```

**Stored as:** `calmar_ratio` (dimensionless)

---

### 12. Win / Loss Statistics

**What it is:** A family of metrics that decompose the daily return series into winning days (positive return) and losing days (negative return). Flat days (0% return) are excluded from the win/loss count.

**Why it matters:** Win rate and average win/loss size tell you about the *character* of a strategy. Some strategies win 80% of the time with small gains and small losses (mean-reversion). Others win only 30% of the time but have huge winners that more than compensate (trend-following). Neither is inherently better — what matters is the combination.

**Metrics included:**

| Metric | Description | How to interpret |
|---|---|---|
| **Win Rate** | % of non-flat days with positive returns | 50%+ is typical for equity markets; doesn't indicate quality on its own |
| **Num Wins / Losses** | Raw count of up/down days | Useful for assessing sample size |
| **Avg Win** | Mean return on winning days | Larger is better, but must be weighed against avg loss |
| **Avg Loss** | Mean return on losing days (negative) | Smaller magnitude is better |
| **Best Day** | Largest single-day return | The best day the strategy has ever had |
| **Worst Day** | Smallest single-day return | The worst day — often during market crashes |

**Formula:**

```
win_rate = num_positive_days / (num_positive_days + num_negative_days)
avg_win  = mean(returns where return > 0)
avg_loss = mean(returns where return < 0)
```

**Implementation:** `compute_win_loss(daily_returns)` → `dict`

```python
# backend/app/services/metrics.py, line 191-224
def compute_win_loss(daily_returns):
    pos = [r for r in daily_returns if r > 0]
    neg = [r for r in daily_returns if r < 0]
    num_wins = len(pos)
    num_losses = len(neg)
    decided = num_wins + num_losses
    return {
        "win_rate": (num_wins / decided) if decided > 0 else 0.0,
        "num_wins": num_wins,
        "num_losses": num_losses,
        "avg_win": np.mean(pos) if pos else 0.0,
        "avg_loss": np.mean(neg) if neg else 0.0,
        "best_day": max(daily_returns),
        "worst_day": min(daily_returns),
        "profit_factor": (sum(pos) / abs(sum(neg))) if neg else 0.0,
    }
```

**Stored as:** `win_rate` (%), `num_wins`, `num_losses`, `avg_win_pct`, `avg_loss_pct`, `best_day_pct`, `worst_day_pct`

---

### 13. Profit Factor

**What it is:** The ratio of gross profits to gross losses. It aggregates all winning daily returns and divides by the absolute value of all losing daily returns.

**Why it matters:** Profit factor combines win rate and average win/loss into a single number. A profit factor of 1.0 means you're breaking even. Below 1.0 means losses exceed gains. This is widely used in quantitative trading to evaluate strategy edge.

**How to interpret:**
- **< 1.0:** Losing strategy (gross losses exceed gross profits)
- **1.0 to 1.5:** Marginal edge
- **1.5 to 2.0:** Good
- **2.0 to 3.0:** Very strong
- **> 3.0:** Exceptional (or too few trades for statistical significance)

**Formula:**

```
profit_factor = Σ(positive returns) / |Σ(negative returns)|
```

**Implementation:** Computed inside `compute_win_loss()` (see above).

**Stored as:** `profit_factor` (dimensionless)

---

## Chart Views

The application has four chart modes, available in both the account-level dashboard and the symphony detail modal.

Chart date series include only US equity trading days: weekends and full NYSE closure holidays are filtered out, while partial-session early-close days are retained. Session detection is sourced from the NYSE exchange calendar (`exchange_calendars`, `XNYS`).

### Account-Level Dashboard

**Chart modes:**

#### Portfolio Value (default)
- **Type:** Stacked area chart
- **Series:**
  - Green area: `portfolio_value` — the actual market value over time
  - Indigo area: `net_deposits` — the cumulative money deposited
- **Visual:** The gap between the green and indigo lines represents profit/loss. When green is above indigo, you're in profit.
- **Toggleable:** Click the legend to show/hide either series

#### TWR (Time-Weighted Return)
- **Type:** Area chart with split-color gradient
- **Series:** `time_weighted_return` (%)
- **Visual:** Green above the 0% reference line, red below. A dashed horizontal line marks 0%. This instantly shows periods of gain vs. loss independent of cash flows.
- **Gradient logic:** The fill color transitions from green to red at the exact Y-position where TWR = 0%, computed dynamically from the data range.

#### MWR (Money-Weighted Return)
- **Type:** Area chart with split-color gradient
- **Series:** `money_weighted_return` (%)
- **Visual:** Purple above 0%, red below. Same split-gradient approach as TWR.
- **Note:** Hidden for symphony-level views (symphonies don't have independent MWR in the chart — only shown at the account level).

#### Drawdown
- **Type:** Area chart, filled downward from 0%
- **Series:** `current_drawdown` (%)
- **Visual:** Red area below the 0% line. Deeper valleys indicate worse drawdowns. The chart is always ≤ 0%.
- **Reference line:** Dashed line at 0%

**Controls:**
- **Period pills:** 1W, 1M, 3M, YTD, 1Y, ALL — filter the data to a time window
- **Date pickers:** Custom start/end date range
- **Chart mode toggle:** Switches between the four views above

---

### Symphony Detail — Live

Same chart modes as account-level (Portfolio Value, TWR, Drawdown) but **without MWR**.

---

### Symphony Detail — Backtest

Backtest data comes from Composer's backtest API. The raw data is `dvm_capital` — a dictionary mapping day-offset numbers to simulated portfolio values (e.g., `{"0": 10000, "1": 10050, ...}`). Day offsets are converted to dates using `epochDayToDate()`.

**Chart modes:**

#### Symphony Value (default)
- **Type:** Area chart (indigo)
- **Series:** `value` — the simulated portfolio value
- **No deposits line** — backtests assume a single initial investment

#### TWR
- **Type:** Split-gradient area chart (green/red)
- **Series:** `twr` (%) — computed client-side from backtest values
- **Computation:** Chain-linked daily returns from the value series

#### Drawdown
- **Type:** Red downward area chart
- **Series:** `drawdown` (%) — peak-to-trough decline computed client-side

**Period filtering:** Same period pills and date pickers as live. When filtering to a sub-period, TWR and drawdown are **rebased** to the start of the filtered window (so TWR starts at 0% and drawdown is measured from the new peak within the window).

---

## Metric Card Layouts

### Account-Level Dashboard Cards

Displayed as a 6-column grid of cards:

| Row 1 | | | | | |
|---|---|---|---|---|---|
| **Total Return** ($) | **TWR** (%) | **Win Rate** (%) | **Sortino** | **Volatility** (%) | **Best Day** (%) |

| Row 2 | | | | | |
|---|---|---|---|---|---|
| **Cum. Return** (%) | **MWR** (%, period) | **W / L** (count) | **Calmar** | **Max Drawdown** (%) | **Worst Day** (%) |

Tooltips on TWR, MWR, Best Day, Worst Day, and Max Drawdown provide additional context (date of occurrence or explanation text).

---

### Symphony Detail — Live Metrics

Displayed above the chart as a 6-column grid of smaller metric tiles:

| | | | | | |
|---|---|---|---|---|---|
| **Current Value** ($) | **Net Deposits** ($) | **Today's Change** (%/$) | **Profit** ($) | **Cum. Return** (%) | **TWR** (%) |
| **Sortino** | **Max Drawdown** (%) | **Annualized** (%) | **Calmar** | **Win Rate** (%) | **Best / Worst Day** (%) |

- **Today's Change** shows both percentage (large) and dollar amount (small)
- **Best / Worst Day** shows both values stacked, green and red respectively
- **Max Drawdown** tooltip shows the date of max drawdown
- **Best/Worst Day** tooltips show the dates

These metrics are **period-aware** — they update when the period filter changes.

---

### Symphony Detail — Backtest Metrics

Displayed as a compact horizontal strip of small tags:

| Cum. Return | Annualized | Sharpe | Sortino | Calmar | Max DD | Median DD | Longest Drawdown | Median DD Length | Win Rate | Volatility |

All values in backtest metrics are stored as **decimals** (e.g., 0.12 = 12%) and displayed with `×100` formatting in the template.

When period is ALL, these are served from `summary_metrics` pre-computed on the backend during backtest caching. When a sub-period is selected, they're computed client-side from the filtered backtest value series.

---

## Glossary

| Term | Definition |
|---|---|
| **Chain-linking** | Multiplicatively compounding a series of periodic returns: `(1+r₁)(1+r₂)...(1+rₙ) - 1` |
| **Deposit-adjusted** | A return calculation that subtracts new deposits from the numerator to isolate investment performance |
| **Drawdown** | The peak-to-trough decline in portfolio value, expressed as a negative percentage |
| **Excess return** | Return above the risk-free rate: `r - rf` |
| **GIPS** | Global Investment Performance Standards — CFA Institute guidelines for reporting investment returns |
| **Brent's method** | A root-finding algorithm (`scipy.optimize.brentq`) used to solve the IRR equation numerically |
| **IRR** | Internal Rate of Return — the discount rate that makes NPV of all cash flows equal zero; the true MWR |
| **Modified Dietz** | A closed-form approximation of IRR that time-weights external cash flows; used as a fallback when the solver fails |
| **Risk-free rate** | The return on a "riskless" investment (typically short-term U.S. Treasury bills); default: 5% annual |
| **Rolling metric** | A metric computed over an expanding window from the start date to each successive day |
| **Symphony** | A Composer.trade strategy unit — an automated portfolio managed by algorithmic rules |
| **ddof=1** | "Delta degrees of freedom" — using N-1 in the standard deviation denominator (Bessel's correction) for sample statistics |
| **√252** | Square root of trading days per year — used to annualize daily volatility/Sharpe/Sortino |
