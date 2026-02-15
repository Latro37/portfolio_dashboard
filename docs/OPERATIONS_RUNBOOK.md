# Operations Runbook

## Purpose

Operational procedures for local development, test execution, and safe recovery.

## Prerequisites

- Python 3.10+
- Node.js 18+
- Dependencies installed (`backend/requirements.txt`, `frontend/package.json`)

## Start and Stop

### Start the app

```bash
python start.py
```

### Stop all local processes

```bash
python stop.py
```

Use `python stop.py --help` for safe usage details.

## Health Verification

1. Backend responds at `http://localhost:8000/api/health`.
2. Frontend responds at `http://localhost:3000`.
3. Account and summary endpoints are reachable after sync.

## Test Mode and DB Isolation

Preferred env vars:
- `PD_TEST_MODE=1`
- `PD_DATABASE_URL=sqlite:///data/portfolio_test.db`

Legacy aliases still supported temporarily:
- `CPV_TEST_MODE`
- `CPV_DATABASE_URL`

Behavior:
- Test mode exposes only `__TEST__` accounts.
- Sync against real Composer accounts is intentionally skipped in test mode.

## Standard Validation Workflows

### Backend and lint baseline

```bash
python -m pytest backend/tests -q
cd frontend
npm run lint
```

### Integrated smoke tests (recommended)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile power
```

### Visual regression

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Visual
```

## Troubleshooting

### Port 8000 or 3000 already in use

1. Run `python stop.py`.
2. Retry start or test script.

### Direct Playwright command fails with connection refused

Cause:
- Backend/frontend were not started.

Resolution:
- Run the script orchestrator instead of raw E2E command:
`powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic`

### Stale frontend build

1. Remove `frontend/.next/`.
2. Restart frontend or rerun script workflow.

### Missing Playwright browser

```bash
cd frontend
npx playwright install chromium
```

## Safe Recovery Procedure

Use this sequence for a clean local reset:

1. `python stop.py`
2. Confirm no services bound to 8000/3000.
3. Rerun baseline checks (`pytest`, `npm run lint`).
4. Run `scripts/run-local-tests.ps1 -Profile basic`.

## Command Discovery

Use these safe help commands:

```bash
python start.py --help
python stop.py --help
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Help
```
