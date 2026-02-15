# Backend Thin Router Skill

## Trigger Conditions

Use this skill when:
- router files contain aggregation, mutation, or persistence logic
- endpoint behavior must be preserved while extracting service seams
- schema-backed responses need to replace raw dictionaries

## Inputs Expected

- Router path(s) being modified.
- Endpoint list in scope.
- Current response schema expectations (keys, status codes, errors).

## Step-by-Step Workflow

1. Baseline current behavior
- Identify route path, method, status codes, and payload shape.
- Review related contract tests in `backend/tests/contracts/*`.

2. Define service boundary
- Move business logic to `backend/app/services/*`.
- Keep router responsibilities to input parsing, calling services, and returning typed responses.

3. Preserve behavior
- Keep route paths unchanged.
- Keep response keys and error message strings unchanged unless explicitly requested.
- Keep account visibility and mode rules unchanged.

4. Type responses
- Add or reuse request/response models in `backend/app/schemas.py`.
- Avoid anonymous body models inside routers when reusable.

5. Wire dependencies explicitly
- Pass service dependencies as function args where useful for testability.
- Avoid circular imports by using focused service modules.

6. Expand tests
- Add/update contract tests for touched endpoints.
- Add seam tests if shared service logic is introduced.

## Required Validation

- `python -m pytest backend/tests/contracts -q`
- `python -m pytest backend/tests -q`
- Optional: targeted endpoint smoke checks in local app

## Output Format for User Reporting

Provide:
1. Routes refactored and new service module(s).
2. Behavior compatibility statement (paths, payload keys, errors).
3. Schema additions/changes.
4. Test evidence.
