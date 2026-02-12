# Composer Portfolio Visualizer

A portfolio tracker and analytics dashboard for [Composer](https://www.composer.trade/) accounts. Built with a Python/FastAPI backend, SQLite database, and Next.js frontend.

## Features

- **Multi-account support** — manage multiple Composer accounts from a single dashboard
- **Full historical backfill** — transactions, holdings, deposits, fees, dividends
- **Incremental updates** — only fetches new data after initial sync
- **20+ metrics** — Sharpe, Sortino, Calmar, TWR, MWR, drawdown, win rate, volatility, and more
- **Symphony analytics** — per-symphony live metrics, backtest charts, allocation history
- **Symphony name search** — search invested symphonies by name when adding benchmark overlays; catalog cached in DB and auto-refreshed
- **Backtest caching** — cached with version-check invalidation (detects symphony edits in Composer)
- **Symphony structure export** — auto-saves symphony JSON definitions locally
- **Daily snapshot** — configurable screenshot captured after market close or manually via camera button
- **Trade preview** — see pending rebalance trades before they execute
- **Live intraday overlay** — real-time portfolio value updates during market hours
- **Real-time ticker quotes** — live price changes per holding via Finnhub WebSocket
- **Dark-themed dashboard** — performance chart, holdings donut, metric cards
- **One-click sync** — Update button in the UI triggers data refresh
- **Manual cash flow entries** — add deposits/withdrawals not captured by the API

## Prerequisites

- Python 3.10+
- Node.js 18+
- A Composer account with API credentials

## Setup

### 1. Get Composer API Credentials

Generate an API key from your Composer account settings.

### 2. Configure Credentials
Copy `accounts.json.example` to `accounts.json`.
```bash
cp accounts.json.example accounts.json
```

Edit `accounts.json` with your API credentials (supports multiple accounts):

```json
{
  "finnhub_api_key": "your-finnhub-api-key",
  "accounts": [
    {
      "name": "Primary",
      "api_key_id": "your-api-key-id",
      "api_secret": "your-api-secret"
    },
    {
      "name": "Wife",
      "api_key_id": "wife-api-key-id",
      "api_secret": "wife-api-secret"
    }
  ]
}
```

> **Note:** The legacy array format (without the wrapping object) is still supported for backward compatibility.

### 3. Real-Time Quotes (Optional)

To enable live price changes next to each holding, sign up for a free API key at [finnhub.io](https://finnhub.io/) and add it to `accounts.json` as shown above (`finnhub_api_key`). Without this key, the dashboard works normally — you just won't see real-time ticker badges.

### 4. Symphony Structure Export (Optional)

Symphony definitions are automatically exported during each data sync and when edits are detected. To enable:

1. Click the **gear icon** (⚙) in the dashboard header to open Settings.
2. Enter a local folder path for exports and click Save.

Exports are saved as `<SymphonyName>/<SymphonyName>_<date>.json`.

### 5. Optional Settings

Copy `.env.example` to `.env` to override defaults (database path, benchmark ticker, risk-free rate):

```bash
cp .env.example .env
```

## Running

### Windows (double-click)

Double-click **`start.bat`**. It checks for Python, launches everything, and opens the dashboard in your browser automatically.

### Command Line

```bash
python start.py
```

This checks prerequisites, installs dependencies, starts both the backend (port 8000) and frontend (port 3000), and opens your browser.

Open **http://localhost:3000** and click **Update** to run the initial data sync.

### Manual Start

If you prefer to start each piece separately:

```bash
# Backend
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

## Security & Privacy

- **Your API keys stay on your machine.** They are stored in `accounts.json`, which is `.gitignored` — it is never committed to version control and most coding assistants won't read it.
- **All network traffic goes directly to Composer's API** (`api.composer.trade`) and optionally Finnhub (`finnhub.io`) for real-time quotes. This app does not send data to any other server.
- **No telemetry or analytics.** Nothing is phoned home.
- **All data is stored locally** in a SQLite database file (`backend/data/portfolio.db`). Nothing is uploaded anywhere.
- **The code is fully auditable.** Every file is plain-text source code you can review before running.

## Documentation

- **[User Guide](docs/USER_GUIDE.md)** — features, setup, dashboard walkthrough, troubleshooting
- **[Architecture](docs/ARCHITECTURE.md)** — project structure, data flow, API reference, database schema
- **[Metrics](docs/METRICS.md)** — detailed metric formulas and calculations

## License

MIT
