# Docs Update Checklist

Use this checklist for every PR to decide which documentation must be updated.

## Change Trigger -> Required Docs

| Trigger | Update Docs |
|---|---|
| User-facing feature, UI behavior, settings defaults, or onboarding flow changed | `README.md` and any relevant feature docs in `docs/` |
| Backend routes, response schemas, or API contracts changed | `docs/ARCHITECTURE.md`, `README.md` (if user-visible), and contract notes in `docs/` |
| Frontend server-state/query behavior changed (keys/fns/invalidation/stale behavior) | `docs/ARCHITECTURE.md` and `docs/TQ1_TANSTACK_QUERY_BLUEPRINT.md` when conventions or patterns change |
| Test commands, run commands, or local orchestration workflow changed | `docs/TESTING.md`, `docs/TEST_MATRIX.md`, and `README.md` (if setup/run instructions are affected) |
| Security posture, credential handling, origin/auth constraints, or privacy behavior changed | `README.md`, `SECURITY.md`, and relevant runbook/docs entries |
| Legal wording, licensing, disclaimers, or third-party service responsibilities changed | `LICENSE`, `DISCLAIMER.md`, `THIRD_PARTY_SERVICES.md`, and `README.md` |
| Module boundaries or ownership changed | `docs/ARCHITECTURE.md`, `docs/CONTRIBUTING.md`, and `AGENTS.md` |

## PR Requirement

Every PR description and final handoff must include:

- `Docs impact: <updated file list>`; or
- `Docs impact: none - <explicit reason>`

Do not defer required docs updates to a follow-up PR unless explicitly requested.
