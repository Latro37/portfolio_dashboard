# Composer Portfolio Visualizer

A portfolio tracker and analytics dashboard for [Composer](https://www.composer.trade/) accounts. Built with a Python/FastAPI backend, SQLite database, and Next.js frontend.

![Dark theme dashboard with M1 Finance-inspired design](https://img.shields.io/badge/theme-dark-1a1a2e)

## Features

- **Full historical backfill** — transactions, holdings, deposits, fees, dividends
- **Incremental updates** — only fetches new data after initial sync
- **20+ metrics** — Sharpe, Sortino, Calmar, TWR, MWR, drawdown, win rate, volatility, and more
- **M1-inspired dashboard** — dark theme, performance chart, holdings donut, metric cards
- **One-click sync** — Update button in the UI triggers data refresh

## Quick Start

### 1. Get Composer API Credentials

Generate an API key from your Composer account settings.

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your credentials:
#   COMPOSER_API_KEY_ID=...
#   COMPOSER_API_SECRET=...
#   COMPOSER_ACCOUNT_ID=...
```

### 3. Run

```bash
python start.py
```

This installs dependencies and starts both the backend (port 8001) and frontend (port 3000).

Open **http://localhost:3000** and click **Update** to run the initial data sync.

### Manual Setup (alternative)

```bash
# Backend
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8001

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

## Architecture

```
composer_portfolio_visualizer/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI entry point
│       ├── config.py            # Settings from .env
│       ├── database.py          # SQLAlchemy + SQLite
│       ├── models.py            # DB tables
│       ├── schemas.py           # Pydantic models
│       ├── composer_client.py   # Composer API wrapper
│       ├── services/
│       │   ├── sync.py          # Backfill + incremental sync
│       │   ├── metrics.py       # All metric computations
│       │   └── holdings.py      # Holdings reconstruction
│       └── routers/
│           ├── portfolio.py     # All API routes
│           └── health.py        # Health check
├── frontend/
│   └── src/
│       ├── app/page.tsx         # Dashboard entry
│       ├── components/          # React components
│       └── lib/api.ts           # Backend API client
├── .env.example
├── start.py                     # One-command launcher
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/summary` | Portfolio summary + all latest metrics |
| GET | `/api/performance?period=1M` | Performance chart data (1D/1W/1M/3M/YTD/1Y/ALL) |
| GET | `/api/holdings?date=2025-12-01` | Holdings for a date (defaults to latest) |
| GET | `/api/holdings-history` | All holdings dates with position counts |
| GET | `/api/transactions?limit=50&symbol=TQQQ` | Transaction history |
| GET | `/api/cash-flows` | Deposits, fees, dividends |
| GET | `/api/metrics` | All daily metrics |
| GET | `/api/sync/status` | Sync state |
| POST | `/api/sync` | Trigger backfill or incremental update |

## Database

SQLite database stored at `backend/data/portfolio.db`. Tables:

- **transactions** — all trades (deduped by order_id)
- **holdings_history** — daily holdings snapshots (reconstructed from trades + splits)
- **cash_flows** — deposits, withdrawals, fees, dividends
- **daily_portfolio** — daily portfolio value + cumulative deposits/fees/dividends
- **daily_metrics** — all computed metrics per day
- **benchmark_data** — SPY daily closes (for Sharpe, Sortino)
- **sync_state** — tracks backfill status and last sync date

## Metrics

| Metric | Description |
|--------|-------------|
| Portfolio Value | Current total value |
| Net Deposits | Cumulative deposits minus CAT fees |
| Total Return ($) | PV - Net Deposits |
| Daily Return % | Simple daily return |
| Cumulative Return % | Total return / net deposits |
| CAGR | Annualized TWR |
| Time-Weighted Return | Chain-linked daily returns |
| Money-Weighted Return | Modified Dietz / XIRR |
| Win Rate | % of positive return days |
| Sharpe Ratio | Excess return / volatility (annualized) |
| Sortino Ratio | Excess return / downside deviation |
| Calmar Ratio | Annualized return / max drawdown |
| Max Drawdown | Largest peak-to-trough decline |
| Annualized Volatility | Std dev × √252 |
| Best/Worst Day | Max/min single-day return |
| Profit Factor | Sum of wins / |sum of losses| |

## License

MIT
