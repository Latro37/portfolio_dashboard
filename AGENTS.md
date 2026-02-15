# Agent Operating Guide

This file is the mandatory entrypoint for any agent or engineer working in this repository.

## Mission

Build and maintain a local-first Portfolio Dashboard for Composer portfolios with:
- stable API behavior
- clear backend and frontend module boundaries
- deterministic testing workflows
- safe, incremental refactors

## Non-Goals

- Big-bang rewrites across backend and frontend in one pass.
- Introducing new state/query libraries without a documented migration plan.
- Re-implementing chart math in multiple places.
- Changing public endpoint behavior unless explicitly requested.

## Safety Rules

1. Keep `backend/app/routers/*.py` thin. Routers perform HTTP mapping only; orchestration belongs in services.
2. Keep shared chart math and transforms in `frontend/src/features/charting/*`.
3. Treat `frontend/src/components/*` as shared UI and compatibility re-exports, not business orchestration.
4. Never use destructive git commands (`git reset --hard`, `git checkout --`) unless explicitly requested.
5. Use seeded test profiles for E2E (`scripts/run-local-tests.ps1 -Profile basic|power`).
6. Use `PD_TEST_MODE` and `PD_DATABASE_URL` only; do not introduce legacy env aliases.
7. For frontend server-state changes, update `frontend/src/lib/queryKeys.ts`, `frontend/src/lib/queryFns.ts`, and `frontend/src/lib/queryInvalidation.ts` before adding new query usage.
8. Do not re-introduce ad hoc component-level API caches when equivalent TanStack Query cache behavior can be used.

## Test Gate Policy By Change Scope

Use `docs/TEST_MATRIX.md` as the source of truth. Minimum required gates:

- Backend only: `python -m pytest backend/tests -q`
- Frontend only: `npm run lint`
- Charting changes: lint + basic profile + visual checks
- Router and schema changes: backend contracts + full backend tests
- Docs only: link and encoding validation

## Command Policy

1. Prefer orchestration scripts for integrated checks:
`powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic`
2. Do not rely on raw `npm run test:e2e:*` unless backend and frontend are already running and healthy.
3. Use `python stop.py` before retries when ports are dirty.
4. Use `scripts/run-local-tests.ps1 -Help` to inspect test runner options safely.

## Naming and Deprecation Policy

- Prefer `PD_TEST_MODE` and `PD_DATABASE_URL`.
- Legacy env aliases are removed.

## TanStack Query Roadmap Note

TQ-1 baseline migration has been adopted. Query conventions and follow-ups are tracked in:
- `docs/ARCHITECTURE.md` under TanStack Query Server-State Layer
- `docs/TQ1_TANSTACK_QUERY_BLUEPRINT.md`

Do not add alternate server-state frameworks ad hoc; extend the existing query key/fn/invalidation contracts.

## Default Workflow

1. Read this file and `docs/TEST_MATRIX.md`.
2. Classify blast radius (backend, frontend, charting, router/schema, docs).
3. Implement smallest safe change.
4. Run required gates for that scope.
5. Update docs if structure or boundaries changed.
6. Report exactly what changed, which tests ran, and any residual risk.
