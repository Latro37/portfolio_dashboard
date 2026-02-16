# TQ-1 TanStack Query Blueprint

## Status

Implemented baseline. TQ-1 migrated frontend server-state flows to TanStack Query while preserving API and UX parity.

## Objectives Delivered

1. Standardized server-state reads/writes behind query keys and mutation invalidation.
2. Removed ad hoc frontend cache orchestration where query cache now owns the same concern.
3. Centralized query defaults for retry/refetch/gc behavior.
4. Preserved existing route contracts and visible behavior.

## Out of Scope (Still)

- Backend endpoint redesign.
- Router path or payload schema changes.
- UI redesign unrelated to server-state lifecycle.

## Core Implementation Artifacts

- `frontend/src/lib/queryClient.ts`
- `frontend/src/app/providers.tsx`
- `frontend/src/lib/queryKeys.ts`
- `frontend/src/lib/queryFns.ts`
- `frontend/src/lib/queryInvalidation.ts`

## Query Policy Baseline

- Default `retry: 1`
- `refetchOnWindowFocus: false`
- `refetchOnReconnect: true`
- `gcTime: 600000`
- Endpoint override `retry: 0` for:
  - `symphonyBacktest`
  - `symphonyBenchmark`

## Query-Key Families

The canonical key registry lives in `frontend/src/lib/queryKeys.ts` and includes:

- Accounts/config: `accounts`, `config`
- Portfolio: `summary`, `summary-live`, `performance`, `holdings`, `holdings-history`, `transactions`, `cash-flows`, `sync-status`, `symphony-export-job-status`
- Symphony: `symphonies`, `symphony-summary`, `symphony-summary-live`, `symphony-performance`, `symphony-backtest`, `symphony-allocations`, `symphony-trade-preview`, `symphony-benchmark`
- Trade preview and benchmarks: `trade-preview`, `benchmark-history`, `symphony-catalog`

## Invalidation Contracts

`frontend/src/lib/queryInvalidation.ts` is authoritative.

1. Sync mutation invalidates:
- summary/performance/holdings/holdings-history/transactions/cash-flows/sync-status/symphonies
- symphony summary/live/performance/backtest/allocations/trade-preview/benchmark families
- `trade-preview`
- `symphony-catalog`
- `symphony-export-job-status`

2. Manual cash-flow mutation invalidates account-scoped:
- `summary`
- `performance`
- `cash-flows`
- `transactions`
- `sync-status`

3. Config writes invalidate:
- `config`

## Migration Coverage

Completed slices:

1. Query infrastructure and provider wiring.
2. Dashboard reads.
3. Dashboard sync/manual cash-flow mutations with scoped invalidation.
4. Symphony detail reads.
5. Benchmark and catalog queryization.
6. Settings and trade-preview server-state migration.
7. Cleanup and docs synchronization.

## Compatibility Constraints

1. Preserve existing endpoint URLs and payload shape usage.
2. Keep shared chart math in `frontend/src/features/charting/*`.
3. Keep compatibility re-export paths in `frontend/src/components/*` unless a dedicated migration is approved.

## Follow-Up Guidance

1. New frontend server-state should default to TanStack Query using shared key and fn contracts.
2. Add new mutation invalidation paths centrally in `queryInvalidation.ts`.
3. Avoid reintroducing component-local caches for API reads unless there is a clear UI-state reason.
4. Use `PD_*` env vars only and do not reintroduce legacy aliases.
