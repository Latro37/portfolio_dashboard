# Docs Sync Skill

## Trigger Conditions

Use this skill when:
- code structure or module boundaries changed
- endpoint behavior/contracts changed
- test workflows or scripts changed
- naming and deprecation policies changed

## Inputs Expected

- File diff summary.
- Updated architecture boundaries.
- Updated commands and validation outcomes.

## Step-by-Step Workflow

1. Determine affected docs
- `AGENTS.md` for agent rules and safety policy.
- `docs/ARCHITECTURE.md` for structure and boundaries.
- `docs/TESTING.md` and `docs/TEST_MATRIX.md` for test workflows.
- `docs/OPERATIONS_RUNBOOK.md` for start/stop/troubleshooting.
- Feature README files where local guidance exists.

2. Update docs with decision-complete details
- Include where logic belongs and where it must not belong.
- Include exact commands for required checks.
- Include migration/deprecation notes and targets.

3. Enforce encoding guardrails
- Use ASCII-first docs by default.
- Remove mojibake artifacts.
- Run scan: `rg -n "Ã|â|?" AGENTS.md docs frontend/README.md`

4. Validate links and references
- Verify relative links resolve to existing files.
- Verify command snippets match current scripts and package commands.

5. Keep docs and implementation consistent
- If code and docs conflict, resolve conflict before finalizing.

## Required Validation

- Encoding scan reports no mojibake artifacts in core docs.
- Relative links in touched docs resolve.
- Referenced commands execute or are verified as valid.

## Output Format for User Reporting

Provide:
1. Docs added/updated.
2. Encoding and link checks performed.
3. Command-reference validation results.
4. Remaining documentation debt (if any).
