# Frontend Boundaries Skill

## Trigger Conditions

Use this skill when:
- a UI change touches data loading, effects, or orchestration
- a feature container is growing too large
- logic placement between `features/*` and `components/*` is unclear

## Inputs Expected

- Feature area (`dashboard`, `symphony-detail`, `trade-preview`, `settings`, `charting`).
- Files currently involved.
- Whether compatibility re-export paths must remain stable.

## Step-by-Step Workflow

1. Identify responsibility
- `features/*`: orchestration, stateful hooks, async data, side effects.
- `components/*`: shared UI primitives and compatibility re-export facades.

2. Extract by concern
- Move effects and coordination into `features/<feature>/hooks/*`.
- Keep render-only components prop-driven and deterministic.

3. Preserve compatibility
- Keep stable imports by re-exporting from `frontend/src/components/*` when required.
- Avoid breaking import paths unless migration is explicitly planned.

4. Enforce chart boundary
- Any shared chart transforms or benchmark math must live in `features/charting/*`.
- Feature-specific adapters can live near the feature if they map domain to chart contracts.

5. Keep UI structure predictable
- Container components compose feature sections.
- Tab sections and panels stay in feature-specific component folders.

6. Update docs when structure changes
- Sync `docs/ARCHITECTURE.md` component tree and placement notes.

## Required Validation

- `cd frontend && npm run lint`
- `powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic`
- For chart-affecting changes: add `-Visual`

## Output Format for User Reporting

Provide:
1. Boundary decisions made (`features` vs `components`).
2. New hooks/components extracted.
3. Compatibility re-exports retained or changed.
4. Validation results.
