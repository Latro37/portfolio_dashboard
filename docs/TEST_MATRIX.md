# Test Matrix

## Purpose

Map change scope to the minimum required validation commands.

## Rules

1. Start with the minimum gates in this matrix.
2. Escalate to broader gates if the change crosses boundaries.
3. Prefer script-orchestrated E2E over direct Playwright invocation.
4. Include a `Docs impact` statement in every PR/handoff (`updated files` or `none` with reason).

## Matrix

| Change Scope | Example File Patterns | Required Checks | Notes |
|---|---|---|---|
| Docs only | `README.md`, `AGENTS.md`, `docs/*.md`, `frontend/README.md`, `DISCLAIMER.md`, `THIRD_PARTY_SERVICES.md`, `SECURITY.md`, `LICENSE` | Link check + encoding scan | Use `docs/DOCS_UPDATE_CHECKLIST.md` to confirm impacted docs were included. Runtime tests optional unless commands changed materially. |
| Backend only (services/models/config) | `backend/app/services/*`, `backend/app/models.py`, `backend/app/config.py` | `python -m pytest backend/tests -q` | Add contracts if endpoint behavior changes. |
| Router + schema changes | `backend/app/routers/*`, `backend/app/schemas.py` | `python -m pytest backend/tests/contracts -q` and `python -m pytest backend/tests -q` | Preserve path/status/payload/error compatibility. |
| Frontend only (non-charting) | `frontend/src/features/dashboard/*`, `frontend/src/features/settings/*`, `frontend/src/features/trade-preview/*`, `frontend/src/features/symphony-detail/*`, `frontend/src/components/*` | `cd frontend && npm run lint` and `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic` | Run `-Profile power` for broad rendering impact. |
| Shared charting logic | `frontend/src/features/charting/*` | `cd frontend && npm run lint`, `cd frontend && npm run test:unit`, `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic -Visual` | Add `-Profile power` when performance/backtest chart paths changed. |
| Scripts / local ops | `start.py`, `stop.py`, `scripts/run-local-tests.ps1` | `python start.py --help`, `python stop.py --help`, `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Help` | Ensure safe help paths and non-destructive behavior (including sandboxed flags such as `--first-start-test`). |
| Cross-layer refactor | Backend + frontend touched | Backend full tests + frontend lint + basic profile; add power/visual based on UI risk | Use conservative gate selection. |

## Canonical Commands

### Backend

```bash
python -m pytest backend/tests/contracts -q
python -m pytest backend/tests -q
```

### Frontend

```bash
cd frontend
npm run lint
npm run test:unit
```

### Script-Orchestrated Integration

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile power
powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Visual
```

## Known Pitfall

Do not assume `npm run test:e2e:basic` or `npm run test:e2e:power` will start backend/frontend services.
If services are not already running, use `scripts/run-local-tests.ps1`.

## Optional Escalation Gates

Use when risk is high or behavior changed in multiple views:
- `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile power`
- `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Visual`
