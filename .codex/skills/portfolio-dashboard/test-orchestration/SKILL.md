# Test Orchestration Skill

## Trigger Conditions

Use this skill when:
- selecting test commands for a change
- debugging test failures caused by environment setup
- verifying release readiness after refactors

## Inputs Expected

- Change scope classification from `docs/TEST_MATRIX.md`.
- Desired profile (`basic` or `power`).
- Whether visual verification is required.

## Step-by-Step Workflow

1. Backend baseline
- Run: `python -m pytest backend/tests -q`

2. Frontend static checks
- Run: `cd frontend && npm run lint`

3. Integrated E2E orchestration
- Basic: `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic`
- Power: `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile power`
- Visual: `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Visual`

4. Use script help when needed
- `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Help`

5. Record exact command outcomes
- Capture pass/fail and total tests where available.

## Known Pitfall

Do not assume raw `npm run test:e2e:*` bootstraps backend/frontend.
Those commands can fail with connection errors unless services are already running.
Use `scripts/run-local-tests.ps1` for reliable orchestration.

## Required Validation

At minimum for non-doc changes:
- `python -m pytest backend/tests -q`
- `cd frontend && npm run lint`
- One profile run via `scripts/run-local-tests.ps1`

## Output Format for User Reporting

Provide:
1. Commands executed.
2. Pass/fail status and key counts.
3. Any skipped gates with explicit reason.
4. Next recommended test gate (if any).
