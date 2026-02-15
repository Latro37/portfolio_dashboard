# Frontend Guide

## Purpose

This frontend renders the Portfolio Dashboard UI and consumes FastAPI backend endpoints exposed under `/api`.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Recharts
- Playwright (E2E + visual)
- Vitest (unit tests)

## Folder Layout

- `src/app/*`: app shell and entry page
- `src/features/dashboard/*`: dashboard orchestration hooks, container, snapshot pipeline
- `src/features/symphony-detail/*`: symphony detail container, tabs, and stateful hooks
- `src/features/trade-preview/*`: trade preview data hook and container
- `src/features/settings/*`: settings modal state and container
- `src/features/charting/*`: shared chart contracts, transforms, controls, and tooltip math
- `src/components/*`: shared UI and compatibility re-export facades
- `src/lib/*`: API client and utilities

## Boundary Rules

1. Keep orchestration and side effects in feature hooks/containers.
2. Keep shared chart math in `src/features/charting/*` only.
3. Keep `src/components/*` focused on presentational/shared UI and stable re-export paths.
4. Do not duplicate benchmark rebasing/drawdown logic across views.

## Development Commands

From `frontend/`:

```bash
npm install
npm run dev
npm run lint
npm run test:unit
npm run test:e2e:basic
npm run test:e2e:power
npm run test:visual
```

## E2E and Visual Orchestration

Preferred from repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile power
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Visual
```

Use script orchestration unless backend/frontend are already running manually.

## Common Workflow

1. Make a focused feature change.
2. Run `npm run lint`.
3. Run root script profile for integrated checks.
4. For charting changes, run visual regression.
5. Update docs if boundaries or behavior expectations changed.

## Related Docs

- `../AGENTS.md`
- `../docs/ARCHITECTURE.md`
- `../docs/TESTING.md`
- `../docs/TEST_MATRIX.md`
- `../docs/TQ1_TANSTACK_QUERY_BLUEPRINT.md`
