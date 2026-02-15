---
name: tanstack-query-contracts
description: Frontend server-state contract workflow for TanStack Query. Use when adding or changing query reads, mutations, query keys, invalidation logic, stale/retry behavior, or feature hooks that consume API data.
---

# TanStack Query Contracts Skill

## Trigger Conditions

Use this skill when:
- adding a new frontend API read or mutation
- changing server-state orchestration in `frontend/src/features/*`
- updating query key shape, stale-time, or retry behavior
- fixing stale data or over-fetching issues

## Inputs Expected

- Feature scope and files touched.
- Endpoint(s) involved and scoping dimensions (`account_id`, `symphony_id`, date range, period).
- Whether behavior must remain UX/API parity.
- Whether charting or benchmark overlays are affected.

## Step-by-Step Workflow

1. Classify state type
- Server-state belongs in TanStack Query (`useQuery` or `useMutation`).
- Keep local UI state local (expanded rows, modal flags, text inputs).

2. Update shared contracts first
- Add or extend key factories in `frontend/src/lib/queryKeys.ts`.
- Add or extend API query functions in `frontend/src/lib/queryFns.ts`.
- For writes, map invalidation in `frontend/src/lib/queryInvalidation.ts`.

3. Design key shape for stable cache behavior
- Include all dimensions that change payload semantics.
- Keep scope explicit (`account_id`, `symphony_id`, period/date parameters).
- Normalize optional dimensions consistently.

4. Apply policy defaults and overrides
- Keep shared defaults from `queryClient` (`retry`, refetch, gc).
- Add endpoint-specific overrides only when justified (for example expensive or low-signal retries).

5. Integrate in feature hooks
- Use query hooks in `frontend/src/features/*/hooks/*`.
- Keep components presentational and prop-driven.
- Do not add ad hoc component-level API caches when query cache can own the concern.

6. Define precise invalidation
- Invalidate the smallest affected query families.
- Scope invalidation by account/symphony where possible.
- Validate dependent panels refresh after mutation without manual hard refresh.

7. Guard against behavior regressions
- Preserve existing loading and error UX unless change is explicitly requested.
- Avoid unstable callback dependencies that can cause fetch loops.

8. Sync docs when contracts change
- Update `docs/ARCHITECTURE.md` and `docs/TQ1_TANSTACK_QUERY_BLUEPRINT.md` if key/fn/invalidation contracts materially change.
- Keep `AGENTS.md` aligned with any new guardrails.

## Required Validation

- `cd frontend && npm run lint`
- `cd frontend && npm run test:unit`
- `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic`
- Add `-Profile power` for broad symphony/dashboard orchestration impacts.
- Add `-Visual` for benchmark/chart rendering changes.

## Output Format for User Reporting

Provide:
1. Query key and query function changes.
2. Mutation invalidation changes and scope.
3. Hook integration updates by feature area.
4. Validation commands run and outcomes.
5. Residual risks or deferred follow-up.
