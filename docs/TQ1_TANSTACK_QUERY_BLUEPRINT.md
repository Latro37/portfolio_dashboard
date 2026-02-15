# TQ-1 TanStack Query Blueprint

## Status

Deferred phase. This is the decision-complete implementation blueprint for migrating frontend server-state logic to TanStack Query.

## Goals

1. Standardize server-state reads/writes behind query keys and mutation invalidation.
2. Remove ad hoc fetch orchestration from feature containers/hooks.
3. Improve consistency for loading, retry, stale-time, and background refetch behavior.
4. Preserve existing route contracts and visible behavior unless explicitly approved.

## Non-Goals

- Backend endpoint redesign.
- Router path or payload schema changes.
- UI redesign unrelated to server-state lifecycle.

## Entry Criteria

1. Refactor gates are green (`pytest`, lint, basic/power E2E, visual as needed).
2. No open critical regressions from architecture/naming refactors.
3. `PD_*` env migration remains backward compatible with `CPV_*` aliases.

## Package and Wiring Decisions

- Add `@tanstack/react-query`.
- Add `QueryClientProvider` in `frontend/src/app/layout.tsx` (or a dedicated provider module imported there).
- Configure one shared `QueryClient` with default options.

## Default Query Policy

- `retry`: 1 for idempotent reads, 0 for known transiently expensive endpoints where retries amplify load.
- `refetchOnWindowFocus`: false by default.
- `refetchOnReconnect`: true.
- `gcTime`: 10 minutes.

## Query Key Registry

Create `frontend/src/lib/queryKeys.ts` and define stable factories:

- `accounts()` -> `['accounts']`
- `config()` -> `['config']`
- `summary(scope)` -> `['summary', scope.accountId, scope.period, scope.startDate, scope.endDate]`
- `summaryLive(scope, live)` -> `['summary-live', scope.accountId, scope.period, scope.startDate, scope.endDate, live.livePv, live.liveNd]`
- `performance(scope)` -> `['performance', scope.accountId, scope.period, scope.startDate, scope.endDate]`
- `holdings(accountId, date)` -> `['holdings', accountId, date]`
- `holdingsHistory(accountId)` -> `['holdings-history', accountId]`
- `transactions(params)` -> `['transactions', params.accountId, params.symbol, params.limit, params.offset]`
- `cashFlows(accountId)` -> `['cash-flows', accountId]`
- `syncStatus(accountId)` -> `['sync-status', accountId]`
- `symphonies(accountId)` -> `['symphonies', accountId]`
- `symphonySummary(scope)` -> `['symphony-summary', scope.symphonyId, scope.accountId, scope.period, scope.startDate, scope.endDate]`
- `symphonySummaryLive(scope, live)` -> `['symphony-summary-live', scope.symphonyId, scope.accountId, scope.period, scope.startDate, scope.endDate, live.livePv, live.liveNd]`
- `symphonyPerformance(scope)` -> `['symphony-performance', scope.symphonyId, scope.accountId]`
- `symphonyBacktest(scope)` -> `['symphony-backtest', scope.symphonyId, scope.accountId]`
- `symphonyAllocations(scope)` -> `['symphony-allocations', scope.symphonyId, scope.accountId]`
- `symphonyTradePreview(scope)` -> `['symphony-trade-preview', scope.symphonyId, scope.accountId]`
- `tradePreview(accountId)` -> `['trade-preview', accountId]`
- `benchmarkHistory(scope)` -> `['benchmark-history', scope.ticker, scope.startDate, scope.endDate, scope.accountId]`
- `symphonyCatalog(refresh)` -> `['symphony-catalog', refresh]`
- `symphonyBenchmark(scope)` -> `['symphony-benchmark', scope.symphonyId, scope.accountId]`

## Stale-Time Decisions

- `accounts`, `config`: 5 minutes
- Portfolio/symphony summary and performance reads: 60 seconds
- `syncStatus`: 10 seconds while sync active, 60 seconds otherwise
- `tradePreview`, `symphonyTradePreview`: 30 seconds during market session, 5 minutes otherwise
- `benchmarkHistory`, `symphonyBenchmark`, `symphonyBacktest`: 15 minutes
- `holdings`, `holdingsHistory`, `transactions`, `cashFlows`: 60 seconds

## Mutation Invalidation Map

1. `POST /api/sync`
- Invalidate: summary, performance, holdings, holdings-history, transactions, cash-flows, symphonies, symphony summaries/performance, trade-preview, sync-status, symphony-catalog.

2. `POST /api/cash-flows/manual`
- Invalidate: cash-flows(account), summary(account), performance(account), transactions(account optional), sync-status(account).

3. `POST /api/config/screenshot`
- Invalidate: config.

4. `POST /api/config/symphony-export`
- Invalidate: config.

5. `POST /api/screenshot`
- No cache invalidation required for read models by default.

## Migration Slices

### Slice 1: Infrastructure

- Add QueryClient provider and key registry.
- Add shared fetch wrappers for query/mutation functions.
- Keep existing behavior untouched.

### Slice 2: Dashboard Read Queries

- Migrate dashboard bootstrap reads:
accounts, summary, performance, holdings, holdings-history, transactions, cash-flows, sync-status.
- Keep current UI state and view model outputs stable.

### Slice 3: Dashboard Mutations

- Migrate sync trigger and manual cash-flow submission to mutations.
- Apply invalidation map.

### Slice 4: Symphony Detail Queries

- Migrate symphony list/detail reads:
symphonies, symphony summary/live, performance, backtest, allocations, trade preview.

### Slice 5: Benchmark and Catalog Queries

- Migrate benchmark-history, symphony-benchmark, symphony-catalog.
- Preserve adapter pipeline in `features/charting/*`.

### Slice 6: Cleanup

- Remove obsolete ad hoc fetch orchestration hooks.
- Consolidate loading/error states from query status.

## Compatibility Constraints

1. Preserve existing endpoint URLs and payload shape usage.
2. Do not move shared chart math out of `features/charting/*`.
3. Keep compatibility re-export paths in `frontend/src/components/*` unless a dedicated migration is approved.

## Failure Modes and Mitigations

- Excessive refetch churn:
Tune stale-time and disable window-focus refetch by default.
- Over-invalidation:
Use targeted key factories and invalidate by scoped keys.
- Divergent loading states:
Normalize loading/error handling in feature containers.

## Test Plan

For each migration slice:

1. `python -m pytest backend/tests -q`
2. `cd frontend && npm run lint`
3. `cd frontend && npm run test:unit`
4. `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic`
5. Add `-Profile power` for broad rendering/performance impacts.
6. Add `-Visual` for chart and settings rendering changes.

## Exit Criteria

1. Dashboard and symphony detail server-state reads are query-based.
2. Mutations invalidate only the necessary query families.
3. Existing E2E and visual suites remain green without increased flakiness.
4. Obsolete ad hoc fetch orchestration is removed or deprecated behind compatibility wrappers.
