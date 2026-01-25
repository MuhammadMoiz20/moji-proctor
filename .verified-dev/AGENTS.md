# Verified Coursework — Agent Operating Rules (Read First)

You are an automated coding agent working in a shared repo with other agents.
Your job is to implement ONLY your assigned scope, safely, with minimal diffs.

## Non-negotiables
- Do NOT merge any PRs. Do NOT push to main/dev directly.
- Do NOT reformat files you did not touch logically.
- Do NOT rename/move folders unless your scope explicitly requires it.
- Keep diffs minimal and reviewable.
- If you need a shared contract changed, open a PR comment / issue note — do not change it silently.

## First steps (required)
1) Read these files:
   - `.verified-dev/WORKFLOW.md`
   - `.verified-dev/CONTRACTS.md`
   - `.verified-dev/ARCHITECTURE.md`
2) Create/update your status file:
   - `.verified-dev/agents/<agent-name>.md`

## Scope discipline
- Only edit files within your owned area.
- If you must touch a shared file (e.g., wiring in extension.ts), keep to the smallest change possible.

## Quality gates
Before opening a PR:
- Run `npm test` if present; otherwise run `npm run build`.
- Ensure TypeScript compiles.
- Ensure no secrets are added.
- Ensure `.verified/` artifacts are not accidentally committed unless explicitly required.

## Deliverables for every PR
In PR description:
- What changed
- How to test manually (step-by-step)
- Any new files
- Any TODOs/known limitations
- Link to your status file

## Security / privacy
- No network calls.
- No telemetry.
- No reading outside the assignment root.
- Never log file contents. Only log hashes/metadata/diff stats.

## If you’re unsure
Prefer:
- leaving a TODO,
- or asking via a PR note,
over guessing and making breaking changes.
