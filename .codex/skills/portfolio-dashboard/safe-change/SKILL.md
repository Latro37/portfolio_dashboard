# Safe Change Skill

## Trigger Conditions

Use this skill when:
- a change spans multiple modules or layers
- risk of regression is non-trivial
- test scope is unclear
- branch hygiene must be enforced before implementation

## Inputs Expected

- Goal statement and in-scope files or directories.
- Current branch name.
- Any explicit constraints (no API changes, no UI changes, etc.).

## Step-by-Step Workflow

1. Preflight checklist
- Run `git status -sb` and verify the worktree is clean or expected.
- Confirm the current branch and remote tracking status.
- Read `AGENTS.md` and `docs/TEST_MATRIX.md`.

2. Branch cleanliness check
- If unrelated uncommitted changes exist, stop and ask how to proceed.
- If changes are expected, isolate the target files and avoid touching unrelated areas.

3. Blast-radius classification
- Classify as one or more: `backend only`, `frontend only`, `charting`, `router/schema`, `docs only`, `scripts/ops`.
- Select required gates from `docs/TEST_MATRIX.md`.

4. Implement minimally
- Change the smallest set of files that satisfies the request.
- Preserve established boundaries (thin routers, feature hooks, charting contracts).

5. Validate by scope
- Run only the mandatory gates for the classified scope first.
- Run broader gates if uncertain or if behavior crosses boundaries.

6. Final integrity checks
- Confirm no accidental file edits.
- Confirm docs were updated when architecture or workflow changed.

## Required Validation

Minimum for this skill:
- `git status -sb`
- Scope-specific commands from `docs/TEST_MATRIX.md`
- Contract tests when endpoint behavior could be affected

## Stop Conditions

Stop and ask for direction if:
- unrelated dirty changes appear in target files
- required test infrastructure is missing and cannot be self-healed
- request conflicts with architectural rules in `AGENTS.md`
- behavior changes are required but not specified

## Output Format for User Reporting

Provide:
1. Scope classification and selected gates.
2. Files changed.
3. Commands run and pass/fail result.
4. Residual risks and follow-up recommendations.
