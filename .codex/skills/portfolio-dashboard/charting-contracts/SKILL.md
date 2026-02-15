# Charting Contracts Skill

## Trigger Conditions

Use this skill when:
- changing benchmark overlays, rebasing, drawdown, or tooltip math
- adding a new chart data source
- fixing inconsistencies between dashboard and symphony chart behavior

## Inputs Expected

- Chart mode(s) affected (`twr`, `mwr`, `portfolio_value`, `drawdown`).
- Data source(s): portfolio, symphony live, backtest, snapshot, benchmark.
- Existing adapters/transforms to be touched.

## Step-by-Step Workflow

1. Locate contract surface
- Shared chart contracts live in `frontend/src/features/charting/types.ts`.
- Shared math lives in `transforms.ts`, `benchmark.ts`, and tooltip helpers.

2. Normalize via adapters
- Use adapter modules to map domain payloads into chart contracts.
- Avoid per-view bespoke math for rebasing or drawdown.

3. Keep one implementation of shared math
- Benchmark rebasing and period slicing should be defined once.
- Drawdown derivation should be shared across chart consumers.
- Tooltip delta formatting should be centrally defined.

4. Wire controls consistently
- Benchmark controls and legend behavior should be consistent across views.
- Preserve known UX placement (for example, benchmark row placement in backtest panel).

5. Update tests
- Add or update chart transform unit tests in charting feature tests.
- Run visual regression when rendering output changes.

## Required Validation

- `cd frontend && npm run lint`
- `cd frontend && npm run test:unit`
- `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic -Visual`

## Output Format for User Reporting

Provide:
1. Contract and adapter files touched.
2. Shared math changed and why.
3. Views impacted.
4. Unit/visual validation evidence.
