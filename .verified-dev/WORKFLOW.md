# Workflow: Branching + PR Rules for Agents

## Base branch
- All branches fork from `main` (or `dev` if configured).
- Never push directly to base.

## Create branch
Branch format:
- `agent/<agent-name>/<scope>`

Commands:
```bash
git checkout main
git pull origin main
git checkout -b agent/<agent-name>/<scope>

Commit style

feat(extension): ...

feat(action): ...

test: ...

chore: ...

Keep in sync (no rebase after PR open)

If base moved:

git fetch origin
git checkout agent/<agent-name>/<scope>
git merge origin/main

PR rules

1 PR per agent scope.

No merges by agents.

PR must include manual test steps + status file link.

Conflict policy

Prefer merging base into your branch (not rebasing).

Avoid modifying contract files unless explicitly assigned.