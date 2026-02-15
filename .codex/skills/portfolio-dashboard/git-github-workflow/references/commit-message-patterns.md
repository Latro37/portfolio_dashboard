# Commit Message Patterns

## Recommended Format

Use:
`type(scope): short imperative summary`

Examples:
- `feat(api): add allocation history endpoint`
- `fix(chart): correct timezone alignment on x-axis`
- `docs(readme): clarify local test profile usage`

## Common Types

- `feat`: new behavior
- `fix`: bug fix
- `refactor`: internal change without behavior change
- `test`: test-only updates
- `docs`: documentation-only updates
- `chore`: maintenance work
- `perf`: performance improvement
- `build`: build system or dependency behavior
- `ci`: CI pipeline behavior
- `revert`: rollback of a previous commit

## Subject Line Rules

- Keep under 72 characters.
- Use imperative mood.
- Avoid trailing punctuation.
- Describe intent, not implementation details.

## Body Guidance

- Explain why the change is needed.
- Explain important tradeoffs or constraints.
- Call out migrations, breaking changes, or manual rollout steps.

## Commit Splitting Guidance

- Separate behavior changes from pure refactors.
- Separate formatting/noise changes from functional changes.
- Keep generated files in their own commit when possible.
