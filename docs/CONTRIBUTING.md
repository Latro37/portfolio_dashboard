# Contributing Guide

## Scope

This document defines how to contribute safely to Portfolio Dashboard after the architecture refactor.

## Core Principles

1. Preserve public API behavior unless a change is explicitly requested.
2. Keep backend routers thin and move business logic to services.
3. Keep shared charting math centralized in `frontend/src/features/charting/*`.
4. Keep feature orchestration in `frontend/src/features/*` hooks and containers.
5. Prefer incremental, test-backed changes over broad rewrites.

## Contribution Flow

1. Understand scope and classify blast radius.
2. Review `AGENTS.md` and `docs/TEST_MATRIX.md`.
3. Implement the smallest coherent change.
4. Run required test gates for scope.
5. Update docs if boundaries, workflows, or contracts changed.
6. Commit with a clear, scoped message.

## Code Boundaries

### Backend

- `backend/app/routers/*`: request parsing, response mapping, dependency wiring only.
- `backend/app/services/*`: business rules, orchestration, aggregations, side effects.
- `backend/app/schemas.py`: reusable request/response models.

### Frontend

- `frontend/src/features/*`: feature hooks, containers, data orchestration.
- `frontend/src/features/charting/*`: shared chart contracts, transforms, benchmark logic, tooltip math.
- `frontend/src/components/*`: shared presentation and compatibility re-exports.

## Commit Conventions

Use scoped commit messages such as:
- `refactor(backend): ...`
- `refactor(frontend): ...`
- `test(backend): ...`
- `docs: ...`
- `chore(scripts): ...`

Keep each commit focused on one concern.

## Minimum Validation Before Push

- Backend changes: `python -m pytest backend/tests -q`
- Frontend changes: `cd frontend && npm run lint`
- Integration-sensitive changes: `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic`
- High-risk UI/chart changes: add visual run (`-Visual`) and power profile when applicable

Use `docs/TEST_MATRIX.md` for the full matrix.

## Documentation Obligations

Update docs when any of these change:
- module ownership or boundaries
- API contracts and expected payload shapes
- test or run commands
- deprecation or migration policy

Minimum docs to review after structural changes:
- `docs/ARCHITECTURE.md`
- `docs/TESTING.md`
- `docs/TEST_MATRIX.md`
- `AGENTS.md`

## Pull Request Checklist

- [ ] Boundaries preserved (thin routers, charting contracts, feature hooks).
- [ ] Required tests for scope passed.
- [ ] Docs updated for changed architecture or workflows.
- [ ] No unrelated files modified.
- [ ] Commit messages are scoped and descriptive.
