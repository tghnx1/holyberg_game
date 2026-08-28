# Holyberg Game — Agent Instructions

Before substantial work in this repository, read:

`docs/codex-handoff.md`

Treat the current repository and Git state as the source of truth. If the handoff is stale, trust the code and report the discrepancy before changing architecture.

## Start every task

1. Check `git status` and current branch.
2. `git fetch origin`.
3. Inspect recent commits relevant to the task.
4. Read the existing modules/systems before proposing new architecture.
5. Reuse existing mechanisms; do not create parallel duplicate systems.
6. Make the smallest focused change that satisfies the task.
7. Run appropriate validation from `package.json` (normally lint, typecheck, tests, production build).
8. Commit the completed task.
9. Stop and report unless explicitly asked to continue.

## Parallel-agent rules

- Assume other agent chats are invisible to you.
- Git branches/commits are the coordination source of truth.
- Use separate branches/worktrees for parallel tasks.
- Avoid broad concurrent edits to the same shared files.
- Before shared integration, fetch/rebase onto the latest intended base and inspect newly landed architecture.
- Do not push unfinished parallel work directly to `main` unless explicitly instructed.

## Architecture guardrails

- Do not redesign the completed character architecture unless explicitly asked.
- Do not hardcode playable character identities into reusable gameplay/dialogue rendering.
- Do not add character-specific gameplay stats.
- Do not create hardcoded scene allowlists for global systems where opt-out/default behavior already exists.
- Keep Level 2 room/NPC placement data-driven and reuse the existing Club/NPC mechanisms.
- Raw incoming assets may be taken from `~/Downloads/`; normalize and place them into canonical project paths.
- Prefer demand-driven/idempotent asset loading.
- Delete obsolete compatibility code when its final consumer is removed.

For detailed project architecture, current Level 2 branch state, character/casting rules, pause system, dialogue behavior, asset intake, and validation history, read `docs/codex-handoff.md`.
