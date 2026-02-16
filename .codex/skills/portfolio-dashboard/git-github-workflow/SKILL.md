---
name: git-github-workflow
description: Best-practice Git and GitHub workflow guidance for day-to-day software delivery. Use when Codex needs to plan or execute branch setup, commit and push hygiene, pull request authoring, test plan reporting, review iteration, merge strategy, and post-merge cleanup with clear rationale documentation.
---

# GitHub Delivery Workflow

## Overview

Run a consistent workflow from issue pickup to merged pull request.
Keep history readable, PRs reviewable, and significant decisions traceable.
When running in full access mode, execute the full branch->edit->commit->push->PR loop autonomously and use PR review as the human oversight checkpoint.

## Operating Mode

- In full access mode, do not stop at local edits; carry work through push and PR creation.
- Any pushed working branch must have a GitHub PR (use draft PR for in-progress work).
- Use sensible intervals for commit/push cadence:
1. push at each validated logical checkpoint
2. for longer work, avoid large local-only deltas; push coherent increments regularly
- Use draft PRs for in-progress changes that benefit from early visibility.
- Do not self-merge unless explicitly instructed and policy permits.

## Workflow

### 1. Start Safely

- Read issue requirements and acceptance criteria.
- Run `git status -sb`; require a clean or intentionally dirty worktree.
- Run `git fetch --prune origin` to sync remote refs.
- Confirm the base branch. In this repo it is `master`.

### 2. Create Branch

- Branch from latest base:
`git switch master && git pull --ff-only && git switch -c <type>/<scope>-<topic>`
- Prefer prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`.
- Include issue id when available, for example: `feat/1234-position-sizing-alerts`.
- Keep one branch per logical change.

### 3. Implement with Commit Hygiene

- Commit only logically related changes.
- Keep commits atomic and buildable; split large work before commit.
- Write commit messages in imperative style.
- Prefer format: `type(scope): short summary`.
- Keep subject lines under 72 characters.
- Explain why in the body when the change is non-obvious.
- For complex issues, evaluate whether a reputable existing Python/JavaScript package solves the problem before implementing from scratch.
- Never add, remove, or upgrade dependencies without explicit human approval after discussing trust/security; this includes `requirements*.txt`, `package.json`, and lockfile changes.
- Before commit:
1. Review staged diff: `git diff --staged`
2. Run relevant lint/tests
3. Confirm no secrets or generated noise

Use `references/commit-message-patterns.md` for message patterns.

### 4. Sync Frequently

- Keep a sync cadence to avoid late conflict bursts:
  - sync from `origin/master` at least daily
  - sync before opening/updating a PR
  - sync again before requesting final review
- Choose strategy by ownership:
  - solo/local branch: `git fetch origin && git rebase origin/master`
  - shared branch or actively reviewed PR branch: `git fetch origin && git merge origin/master`
- Resolve conflicts immediately after each sync and rerun required tests.
- Use force push only after rebase, and only with lease:
`git push --force-with-lease`
- Prefer merge-from-master (not rebase) once a branch is shared to avoid rewriting history other contributors are based on.

### 5. Push and Open Pull Request

- Push branch: `git push -u origin <branch>`
- Open PR in GitHub UI or CLI:
`gh pr create --fill --base master --head <branch>`
- If no PR exists for the branch yet, create one immediately (draft allowed) before continuing other work.
- For non-trivial work, open a draft PR early and update it as checkpoints land.
- Draft PR body from `references/pr-description-template.md`.
- **PowerShell note (PR body formatting):** Prefer `gh pr create/edit --body-file <path>` over `--body "<string>"`.
  - Passing multi-line bodies via `--body` in PowerShell can render literal `\n` sequences in GitHub's UI depending on quoting/escaping.
  - Use a here-string to build the Markdown body and write it to a temp file, then pass `--body-file`.
- Include in every PR:
1. Problem statement and solution summary
2. Scope and explicit non-goals
3. Significant decisions with rationale
4. Test plan with exact commands and observed results
5. Risks and rollback notes when relevant
6. Screenshots or logs for UI/behavior changes

### 6. Document Significant Decisions

- Record tradeoffs in the PR under "Significant decisions and rationale."
- For high-impact choices, create a separate entry using
`references/decision-rationale-template.md`.
- Capture:
1. Context and constraints
2. Alternatives considered
3. Chosen option and reasoning
4. Consequences and follow-up work

### 7. Manage Review Iterations

- Address comments in focused follow-up commits.
- Keep PR discussion current:
1. Resolve threads with concrete responses
2. Post a short change summary after major updates
3. Update test plan when behavior changes
- Re-request review after substantial updates.

### 8. Merge and Clean Up

- Merge only after approvals and required CI checks pass.
- Prefer squash merge for iterative branch history unless repository policy says otherwise.
- Treat PR review as the required human-in-the-loop approval gate.
- After merge:
1. `git switch master && git pull --ff-only`
2. `git branch -d <branch>`
3. `git push origin --delete <branch>` if remote branch is not auto-deleted
- Close linked issue and record deferred follow-up work.

## Parallel Work (Multiple Agents)

Use this when multiple agents (or humans) need to work in the same repository concurrently.

### Preferred: One Worktree Per Agent/Task

Use `git worktree` so each agent has an isolated working directory (independent uncommitted changes, build artifacts, and `node_modules`).

PowerShell example:

```powershell
git fetch --prune origin
git switch master
git pull --ff-only

# Create a sibling folder to hold worktrees (outside the repo folder).
mkdir ..\\pd-worktrees -ErrorAction SilentlyContinue | Out-Null

# Create a new branch and worktree for an agent/task.
git worktree add ..\\pd-worktrees\\agent-alice-feat-metrics-export -b agent/alice/feat-metrics-export

# In that new worktree directory:
cd ..\\pd-worktrees\\agent-alice-feat-metrics-export
git status -sb
```

Notes:
- Keep branches agent-scoped: `agent/<name>/<type>-<topic>` or `feat/<topic>-<agent>`.
- Avoid `git stash` for long-lived work; stashes are shared across worktrees. If you must stash, name it: `git stash push -m "agent/alice: <topic>"`.
- Only `--force-with-lease` your own branch, and never rewrite a branch another agent is actively based on without coordinating first.

### Optional: Stacked PRs for Dependent Work

If Agent B depends on Agent A:
- Agent A opens PR-A to `master`.
- Agent B branches from PR-A's branch and opens PR-B with base = PR-A branch.
- PR-B should clearly state dependency (see PR template "Coordination").
- After PR-A merges, retarget PR-B to `master` and rebase onto `origin/master`.

## Quality Gates for Every PR

- Ensure lint/tests pass at the required scope.
- Ensure the test plan is reproducible by another engineer.
- Ensure non-trivial decisions include clear rationale.
- Ensure no unrelated file edits or secret material are present.
- Ensure branch is current with base at merge time.

## Stop Conditions

- Stop and clarify when acceptance criteria are missing or conflicting.
- Stop and clarify when unrelated local changes appear in target files.
- Stop and clarify when required tests cannot run in the current environment.
- Stop and clarify before rewriting shared history on protected branches.

## References

- PR template: `references/pr-description-template.md`
- Decision rationale template: `references/decision-rationale-template.md`
- Commit message patterns: `references/commit-message-patterns.md`
