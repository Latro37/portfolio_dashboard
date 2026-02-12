# User Guide

A practical guide to using the Composer Portfolio Visualizer — a local dashboard for tracking, analyzing, and benchmarking your [Composer](https://www.composer.trade/) portfolio.

---

## Table of Contents

1. [Features](#features)
2. [Show Me the Money (Quick Setup)](#show-me-the-money-quick-setup)
3. [Detailed Setup](#detailed-setup)
4. [Getting Started](#getting-started)
5. [Dashboard Guide](#dashboard-guide)
6. [Symphony Analytics](#symphony-analytics)
7. [Settings & Configuration](#settings--configuration)
8. [Troubleshooting & FAQ](#troubleshooting--faq)
9. [Security & Privacy](#security--privacy)

---

## Features

- **Multi-account support** — Track multiple Composer accounts (e.g. yours + spouse's) from a single dashboard. Switch between accounts or view them aggregated together.
- **Full historical backfill** — On first sync, the app downloads your entire transaction history, holdings, deposits, fees, and dividends.
- **Incremental updates** — After the initial sync, only new data is fetched. If the app hasn't run for days, it automatically fills in the gaps.
- **20+ portfolio metrics** — Sharpe ratio, Sortino ratio, Calmar ratio, TWR, MWR, max drawdown, win rate, volatility, annualized return, and more. All computed live from your data.
- **Performance chart** — Interactive chart with TWR, MWR, Portfolio Value, and Drawdown views. Adjustable time periods (1D–All) and custom date ranges.
- **Benchmark overlays** — Compare your performance against SPY, QQQ, TQQQ, any ticker symbol, or other Composer symphonies. Up to 3 benchmarks at once.
- **Symphony name search** — Type a symphony name to find and add it as a benchmark overlay. No need to look up IDs or URLs.
- **Symphony analytics** — Per-symphony live performance charts, backtest results, allocation history, and current holdings.
- **Backtest caching** — Symphony backtests are cached locally and automatically re-fetched when you edit the symphony in Composer.
- **Symphony structure export** — Automatically saves your symphony logic trees as JSON files whenever they change.
- **Daily snapshot** — Captures a clean portfolio summary image after market close (or manually via the camera button). Configurable chart type, metrics, and date range.
- **Trade preview** — See what trades are pending before the next rebalance.
- **Live intraday data** — During market hours, your portfolio value updates in real time.
- **Real-time ticker quotes** — Live price change badges next to each holding (requires free Finnhub API key).
- **Holdings visualization** — Donut chart and detailed list of current positions with allocation percentages.
- **Transaction history** — Searchable, paginated list of all trades.
- **Cash flow tracking** — Deposits, withdrawals, fees, and dividends. Supports manual entries for transfers not captured by the API.
- **Dark-themed UI** — Easy on the eyes for extended monitoring sessions.

---

## Show Me the Money (Quick Setup)

Get up and running in under 5 minutes.

**Prerequisites:** Python 3.10+ and Node.js 18+ installed on your machine.

**Steps:**

1. **Get your Composer API key.** Log into [Composer](https://app.composer.trade/) → Settings → API Keys → Generate.

2. **Configure credentials.** Copy the example file and paste in your keys:
   ```bash
   cp accounts.json.example accounts.json
   ```
   Open `accounts.json` and replace the placeholder values:
   ```json
   {
     "accounts": [
       {
         "name": "Primary",
         "api_key_id": "your-api-key-id",
         "api_secret": "your-api-secret"
       }
     ]
   }
   ```

3. **Launch.** Double-click `start.bat` (Windows) or run:
   ```bash
   python start.py
   ```
   The browser opens automatically.

4. **Sync your data.** Click the **Update** button in the top-right corner. The initial sync takes 30–60 seconds depending on your account history. After that, your dashboard is live.

That's it. You're done.

---

## Detailed Setup

A more thorough walkthrough for users who want guidance on every step.

### Prerequisites

| Requirement | How to check | Where to get it |
|-------------|-------------|-----------------|
| Python 3.10+ | `python --version` | [python.org](https://www.python.org/downloads/) |
| Node.js 18+ | `node --version` | [nodejs.org](https://nodejs.org/) |
| Composer account | You have one if you trade on Composer | [composer.trade](https://www.composer.trade/) |

### Getting Your Composer API Credentials

1. Log into your Composer account at [app.composer.trade](https://app.composer.trade/).
2. Click your profile icon in the top-right corner.
3. Go to **Settings** → **API Keys**.
4. Click **Generate API Key**.
5. You'll receive two values:
   - **API Key ID** — a short identifier (e.g. `ak_abc123...`)
   - **API Secret** — a longer secret string
6. **Save both values immediately.** The secret is only shown once. If you lose it, you'll need to generate a new key.

### Configuring `accounts.json`

This file tells the app which Composer accounts to connect to.

1. In the project root folder, copy the example file:
   ```bash
   cp accounts.json.example accounts.json
   ```
   On Windows, you can also just duplicate the file in File Explorer and rename it.

2. Open `accounts.json` in any text editor and fill in your credentials:
   ```json
   {
     "accounts": [
       {
         "name": "Primary",
         "api_key_id": "paste-your-api-key-id-here",
         "api_secret": "paste-your-api-secret-here"
       }
     ]
   }
   ```

   - **`name`** — A label you choose (shown in the dashboard's account switcher). Can be anything: "Primary", "My IRA", "Joint", etc.
   - **`api_key_id`** — The API Key ID from step 5 above.
   - **`api_secret`** — The API Secret from step 5 above.

3. **Multiple accounts** — If you manage more than one Composer account (e.g. yours and a spouse's), add another entry to the `accounts` array:
   ```json
   {
     "accounts": [
       {
         "name": "Primary",
         "api_key_id": "your-key-id",
         "api_secret": "your-secret"
       },
       {
         "name": "Spouse",
         "api_key_id": "spouse-key-id",
         "api_secret": "spouse-secret"
       }
     ]
   }
   ```
   Each account will appear in the account switcher dropdown on the dashboard.

### Optional: Real-Time Ticker Quotes

To see live price changes next to each holding (e.g. "+$1.23 (+0.5%)"):

1. Sign up for a free API key at [finnhub.io](https://finnhub.io/).
2. Add the key to your `accounts.json`:
   ```json
   {
     "finnhub_api_key": "your-finnhub-key",
     "accounts": [ ... ]
   }
   ```

Without this key, the dashboard works normally — you just won't see real-time ticker badges.

### Optional: Environment Overrides

Copy `.env.example` to `.env` to customize advanced settings:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///data/portfolio.db` | Path to the SQLite database file |
| `BENCHMARK_TICKER` | `SPY` | Default benchmark ticker for comparisons |
| `RISK_FREE_RATE` | `0.05` | Annual risk-free rate used in Sharpe/Sortino calculations |

Most users don't need to change these.

### Starting the App

**Option A: Windows (easiest)**
Double-click `start.bat` in the project folder. It checks prerequisites, installs dependencies, starts both servers, and opens your browser.

**Option B: Command line**
```bash
python start.py
```
Same as Option A but from any terminal.

**Option C: Manual start** (two terminals)
```bash
# Terminal 1 — Backend
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```
Then open **http://localhost:3000** in your browser.

### Verifying It Works

1. The browser should open to a dark-themed dashboard.
2. Click the **Update** button (top-right, green).
3. You should see a progress indicator while the initial sync runs.
4. After 30–60 seconds, your portfolio value, chart, metrics, and holdings appear.

If something goes wrong, check the [Troubleshooting](#troubleshooting--faq) section.

---

## Getting Started

### First Sync

When you click **Update** for the first time, the app downloads your complete Composer history:

- **Transactions** — Every buy and sell order
- **Portfolio values** — Daily portfolio value snapshots
- **Cash flows** — Deposits, withdrawals, fees (CAT/TAF), and dividends
- **Holdings** — Current positions and historical position reconstruction
- **Symphony data** — Per-symphony daily values and metadata

This typically takes **30–60 seconds** depending on your account age and trading frequency.

### After the First Sync

Subsequent syncs are **incremental** — only new data since the last sync is fetched. These typically complete in under 10 seconds.

The app also runs an **automatic sync after market close** (4:00 PM ET) if you leave the page open. A `localStorage` flag prevents duplicate syncs.

If the app hasn't been opened for several days, the next sync automatically **fills in all missing days** — no data is lost from downtime.

---

## Dashboard Guide

### Portfolio Header

The top section shows:
- **Portfolio Value** — Your current total portfolio value in dollars
- **Total return** — Dollar and percentage gain/loss since inception
- **Today's change** — Dollar and percentage change for the current day
- **Live / Update toggle** — "Live" enables real-time intraday value updates during market hours. "Update" triggers a data sync.
- **Camera button** (📷) — Manually capture a portfolio snapshot image
- **Gear button** (⚙) — Open settings

### Account Switcher

If you have multiple accounts configured, a dropdown appears in the header:
- **All Sub-Accounts** — Aggregates all accounts into one combined view
- **Individual accounts** — Select a specific sub-account to view it alone
- **Credential groups** — If one API key has multiple sub-accounts (e.g. Individual + IRA), you can view them grouped

### Performance Chart

The main chart supports four view modes via toggle buttons:
- **TWR** (Time-Weighted Return) — Your return percentage, immune to deposit/withdrawal timing
- **MWR** (Money-Weighted Return) — Your return accounting for the timing of cash flows
- **Portfolio Value** — Raw dollar value over time (includes a deposits line for reference)
- **Drawdown** — How far below the peak your portfolio has been at each point

**Time periods:** 1D, 1W, 1M, 3M, YTD, 1Y, ALL, or pick a custom date range with the date pickers.

### Benchmark Overlays

Compare your performance against up to 3 benchmarks simultaneously:

- **Predefined tickers** — Click **SPY**, **QQQ**, or **TQQQ** to toggle them on/off
- **Custom ticker** — Click the **+** button, type any valid ticker symbol (e.g. `AAPL`, `BTC-USD`), and press Go
- **Symphony by name** — Click **+**, start typing a symphony name (2+ characters), and select from the dropdown
- **Symphony by URL/ID** — Paste a Composer symphony URL (e.g. `https://app.composer.trade/symphony/abc123/details`) or just the ID

Benchmark lines are color-coded (orange, white, pink). Click an active benchmark button to remove it.

### Metric Cards

Below the chart, key metrics are displayed as tiles:
- **Annualized Return** — Your projected yearly return based on cumulative performance
- **TWR** — Time-weighted return for the selected period
- **Win Rate** — Percentage of days with positive returns
- **Sortino** — Risk-adjusted return (penalizes only downside volatility)
- **Volatility** — Annualized standard deviation of daily returns
- **Best Day / Worst Day** — Largest single-day gain and loss

Hover over the ⓘ icon on any metric for a brief explanation. Click "Metrics Guide" to view detailed formulas for every metric.

### Holdings

- **Holdings Allocation** (donut chart) — Visual breakdown of your current positions by percentage
- **Holdings list** — Table with ticker, shares, market value, allocation %, and real-time price badges (if Finnhub is configured). Navigate to past dates to see historical positions.

### Detail Tabs

Three tabs below the main dashboard:

- **All Metrics** — Complete list of 20+ computed metrics, grouped by category
- **Transactions** — Paginated table of every trade (filterable by symbol)
- **Non-Trade Activity** — Cash flows including deposits, withdrawals, fees, and dividends. Includes a form to **manually add** deposits or withdrawals not captured by the API.

### Symphony Cards

A grid of cards showing each invested symphony with:
- Current value and allocation percentage
- Today's change
- Click any card to open the **Symphony Detail** modal

### Trade Preview

Shows pending rebalance trades that will execute at the next scheduled rebalance. Useful for previewing what Composer plans to do before it happens.

---

## Symphony Analytics

Click any symphony card to open its detail view. The modal has two main tabs:

### Live Tab

Shows your **actual live performance** for this symphony:
- **Performance chart** — Same TWR/MWR/Value/Drawdown modes as the main dashboard, scoped to this symphony
- **Drawdown chart** — Separate drawdown visualization
- **Metrics** — Symphony-specific metrics (return, Sharpe, Sortino, max drawdown, etc.)
- **Current holdings** — What this symphony currently holds

### Backtest Tab

Shows **backtested historical performance** of the symphony's logic:
- **Backtest chart** — How the symphony would have performed historically
- **Benchmark overlays** — Same benchmark system as the main chart (SPY/QQQ/TQQQ, custom tickers, other symphonies)
- **Backtest metrics** — Key stats from the backtest (return, Sharpe, max drawdown, etc.)

**Cache behavior:** Backtest results are cached locally for 24 hours. If you edit the symphony in Composer, the app detects the change and automatically re-fetches a fresh backtest.

**Backtest friction:** This app uses slightly more conservative slippage and spread assumptions than Composer's defaults (15 bps total vs 1 bps). This means backtest returns will be slightly lower than what Composer shows, but closer to real-world execution.

### Trade Preview

At the bottom of the modal, you can see pending rebalance trades for this specific symphony.

---

## Settings & Configuration

Click the **gear icon** (⚙) in the dashboard header to open Settings.

### Symphony Export

Enter a local folder path to automatically save your symphony definitions as JSON files. Exports are saved as `<SymphonyName>/<SymphonyName>_<date>.json` and update whenever you edit a symphony in Composer or run a sync.

This is useful as a backup of your symphony logic and for tracking changes over time.

### Daily Snapshot

Configure an automatic portfolio screenshot captured after market close each day:

| Setting | Description |
|---------|-------------|
| **Enabled** | Toggle automatic daily snapshots on/off |
| **Save path** | Local folder where snapshot PNGs are saved |
| **Account** | Which account to capture (if you have multiple) |
| **Chart type** | TWR, Portfolio Value, MWR, or Drawdown |
| **Time period** | 1W, 1M, 3M, YTD, 1Y, All, or custom start date |
| **Hide portfolio value** | Omit the dollar amount from the snapshot (for sharing) |
| **Metrics** | Choose which metric cards appear in the snapshot |

Snapshots are saved as `Snapshot_YYYY-MM-DD.png` (1200×900 resolution).

You can also capture a snapshot manually at any time by clicking the **camera button** (📷) in the dashboard header.

---

## Troubleshooting & FAQ

### No data is showing on the dashboard
Click the **Update** button in the top-right corner. The app doesn't fetch data automatically on first launch — you need to trigger the initial sync.

### The sync seems stuck or is taking a long time
The first sync can take 30–60 seconds. If it takes longer than 2 minutes, check the terminal window running the backend for error messages.

### Symphony backtest shows old data
Backtests are cached for up to 24 hours. If you edited the symphony recently, the app checks for edits and re-fetches automatically. You can also close and reopen the symphony detail to trigger a fresh check.

### Real-time price badges aren't showing
You need a Finnhub API key configured in `accounts.json`. See [Optional: Real-Time Ticker Quotes](#optional-real-time-ticker-quotes). The free tier is sufficient.

### Chart shows flat lines on weekends
This is expected — weekends and market holidays are filtered out to avoid flat gaps. The chart only shows trading days.

### I was away for a week — is my data missing?
No. The next time you sync, the app detects the gap and backfills all missing days automatically.

### Can I add deposits that the API doesn't capture?
Yes. Go to the **Non-Trade Activity** tab and use the manual entry form to add deposits or withdrawals with a date and amount.

### How do I add another Composer account?
Add another entry to the `accounts` array in `accounts.json` and restart the app. See [Multiple accounts](#configuring-accountsjson).

### Where is my data stored?
Everything is in a local SQLite database at `backend/data/portfolio.db`. No data leaves your machine.

---

## Security & Privacy

- **Your API keys stay on your machine.** They are stored in `accounts.json`, which is git-ignored and never committed to version control.
- **All network traffic goes directly to Composer's API** (`api.composer.trade`) and optionally Finnhub (`finnhub.io`) for real-time quotes. This app does not send data to any other server.
- **No telemetry or analytics.** Nothing is phoned home.
- **All data is stored locally** in a SQLite database file. Nothing is uploaded anywhere.
- **The code is fully auditable.** Every file is plain-text source code you can review before running.
