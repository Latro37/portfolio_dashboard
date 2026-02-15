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
3. Run `docs/DOCS_UPDATE_CHECKLIST.md` against the planned change.
4. Implement the smallest coherent change.
5. Run required test gates for scope.
6. Update docs per checklist when behavior, contracts, commands, legal, or security posture changed.
7. Commit with a clear, scoped message.

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

## Working in Parallel (Multiple Agents)

If multiple agents or engineers are contributing at the same time, prefer workflows that reduce merge conflicts and avoid shared working-directory state.

### Recommended: `git worktree` per branch

`git worktree` lets each agent work in an isolated folder while sharing the same `.git` repository.

PowerShell example:

```powershell
git fetch --prune origin
git switch master
git pull --ff-only

mkdir ..\\pd-worktrees -ErrorAction SilentlyContinue | Out-Null
git worktree add ..\\pd-worktrees\\agent-alice-feat-metrics -b agent/alice/feat-metrics
```

### Branch naming and sync rules

- Use one branch per logical change.
- Prefer agent-scoped names when running parallel: `agent/<name>/<type>-<topic>`.
- Keep branches current with `git fetch --prune origin` and `git rebase origin/master`.
- Only force-push after rebasing, and only with lease: `git push --force-with-lease`.

### Stacked PRs (optional)

Use stacked PRs only when there is a real dependency:
- PR-B is opened against PR-A's branch.
- PR-B explicitly lists dependency in the PR description (see PR template "Coordination").
- After PR-A merges, retarget PR-B to `master` and rebase onto `origin/master`.

## Contribution License

By submitting a contribution, you agree that your contribution is licensed under this repository's [MIT License](../LICENSE).

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
- security/privacy behavior or credential handling
- legal/disclaimer/license/third-party terms language

Minimum docs to review after structural changes:
- `docs/ARCHITECTURE.md`
- `docs/TESTING.md`
- `docs/TEST_MATRIX.md`
- `docs/DOCS_UPDATE_CHECKLIST.md`
- `AGENTS.md`

## Pull Request Checklist

- [ ] Boundaries preserved (thin routers, charting contracts, feature hooks).
- [ ] Required tests for scope passed.
- [ ] Docs updated per `docs/DOCS_UPDATE_CHECKLIST.md`.
- [ ] Docs impact statement included in PR (`updated files` or `none` with reason).
- [ ] No unrelated files modified.
- [ ] Commit messages are scoped and descriptive.
