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
9. Run a docs impact check for every change. If behavior, setup, contracts, commands, security, or legal posture changed, update docs in the same branch.
10. Every PR and final handoff must include a `Docs impact` line: list updated docs, or state `none` with a concrete reason.

## Documentation Sync Policy

Use `docs/DOCS_UPDATE_CHECKLIST.md` for required docs impact mapping.

When docs are impacted, update the relevant files in the same change, including as applicable:
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/TESTING.md`
- `docs/TEST_MATRIX.md`
- `docs/CONTRIBUTING.md`
- `DISCLAIMER.md`
- `THIRD_PARTY_SERVICES.md`
- `SECURITY.md`
- `LICENSE`

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

## GitHub Execution Policy (Full Access Mode)

When the agent has full repository access and push capability, run the end-to-end delivery loop without waiting for manual handoff:

1. Create a dedicated branch from latest `master`/`main` for each logical change.
2. Implement the smallest safe change and run required gates for scope.
3. Commit and push in sensible intervals:
- push after each validated logical checkpoint (not every small edit)
- for longer tasks, avoid long-lived local-only work; push incremental, coherent commits regularly
4. Open or update a PR as soon as the change is reviewable; use draft PR for in-progress work.
   - Every working branch with commits must have a corresponding GitHub PR (draft is acceptable while in progress).
   - Do not leave a pushed branch without an open PR.
5. Keep PR description current with:
- what changed
- test plan and results
- significant decisions and rationale
6. Continue iterating by pushing follow-up commits to the same PR until ready for human review.

Human-in-the-loop control occurs at PR review and approval. Do not bypass required review or merge protections.

## Multi-Agent Git Workflow

When multiple agents (or humans) need to work in this repository concurrently:

1. Use one branch per logical change, and scope branches per agent when helpful:
   - `agent/<name>/<type>-<topic>` (recommended)
   - or `feat/<topic>-<agent>`
2. Prefer `git worktree` so each agent has an isolated working directory and cannot trample uncommitted changes:
   - Example:
     - `mkdir ..\\pd-worktrees -ErrorAction SilentlyContinue | Out-Null`
     - `git worktree add ..\\pd-worktrees\\agent-alice-fix-sync -b agent/alice/fix-sync`
3. Keep branches current via `git fetch --prune origin` and regular syncs from `origin/master`.
4. Use a branch sync cadence to reduce late conflicts: sync from `origin/master` at least daily, before opening a PR, and again right before requesting final review.
5. Pick the sync strategy by branch ownership:
   - Solo/local branch: `git rebase origin/master`.
   - Shared branch or actively reviewed PR branch: `git merge origin/master` (avoid force-pushing shared history).
6. Resolve conflicts immediately after each sync and rerun required tests before pushing.
7. Use stacked PRs only when there is a true dependency, and call it out explicitly in the PR description (see PR template "Coordination").
8. Avoid long-lived `git stash` entries; stashes are shared across worktrees. If you must stash, use a message identifying the agent and topic.

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
3. Create a dedicated branch for the change.
4. Implement smallest safe change.
5. Run required gates for that scope.
6. Commit and push coherent checkpoints at sensible intervals.
7. Open or update PR with tests and rationale.
8. Run docs impact check and update docs listed in `docs/DOCS_UPDATE_CHECKLIST.md` as needed.
9. Report exactly what changed, which tests ran, docs impact, and any residual risk.
