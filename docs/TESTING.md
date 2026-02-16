# Testing Guide

## Summary
This project supports local-only testing with:
- deterministic synthetic profiles (`basic`, `power`)
- Playwright E2E smoke tests
- optional Playwright visual snapshot tests
- strict DB isolation via `PD_DATABASE_URL`

Related references:
- `docs/TEST_MATRIX.md` for required validation gates by change scope
- `docs/OPERATIONS_RUNBOOK.md` for troubleshooting and safe recovery

## One-time Setup

### Backend dependencies
```bash
cd backend
python -m pip install -r requirements.txt
```

### Frontend dependencies
```bash
cd frontend
npm install
```

### Playwright browser
```bash
cd frontend
npx playwright install chromium
```

## DB Isolation

- Production/default DB: `data/portfolio.db`
- Test DB: `data/portfolio_test.db`

Always set:
- `PD_TEST_MODE=1`
- `PD_DATABASE_URL=sqlite:///data/portfolio_test.db`

Legacy env aliases are removed and unsupported.

Account visibility behavior:
- Test mode (`--test`): only `__TEST__` accounts are visible/usable.
- Normal mode (no `--test`): `__TEST__` accounts are hidden and blocked.
- Sync in test mode is intentionally disabled (no real Composer account sync into test DB).
- First-start simulation mode (`--first-start-test`): runs against an isolated sandbox config/database/local storage that is wiped and recreated on each launch.

## Seed Profiles

From `backend/`:
```bash
python -m scripts.seed_test_data --profile basic
python -m scripts.seed_test_data --profile power
```

Optional deterministic controls:
```bash
python -m scripts.seed_test_data --profile power --seed 42 --end-date 2025-12-31
```

Safety guard:
- seeding/purge aborts on non-test DB unless `--force` is passed.

## Core Commands

### Backend unit tests
```bash
python -m pytest backend/tests/test_metrics.py -q
```

### Frontend unit tests
```bash
cd frontend
npm run test:unit
```

### E2E smoke tests
```bash
cd frontend
npm run test:e2e:basic
npm run test:e2e:power
```

### Repeatable first-start simulation (manual UX checks)
```bash
python start.py --first-start-test
```

This mode is useful for validating one-time onboarding behavior repeatedly without polluting normal local user data.

### Optional visual tests
```bash
cd frontend
npm run test:visual
npm run test:visual:update
```

Visual baselines are local-only and gitignored:
- `frontend/.visual-baselines/`

## Orchestration Script

PowerShell runner:
`scripts/run-local-tests.ps1`

Examples:
```powershell
.\scripts\run-local-tests.ps1 -Help
.\scripts\run-local-tests.ps1
.\scripts\run-local-tests.ps1 -Profile power
.\scripts\run-local-tests.ps1 -Visual
.\scripts\run-local-tests.ps1 -Visual -UpdateSnapshots
.\scripts\run-local-tests.ps1 -Headed
```

## Troubleshooting

### Port already in use
- Run `python stop.py` from repo root and retry.

### Stale frontend build cache
- Remove `frontend/.next/` and rerun `npm run dev`.

### Missing visual baselines
- Run `npm run test:visual:update` once to generate local snapshots.

### Playwright browser missing
- Run `npx playwright install chromium` in `frontend/`.
