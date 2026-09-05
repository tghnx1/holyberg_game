# Holyberg Game — Agent Instructions

Use this file as the primary task router.

Read only the relevant subsystem/files for the task. Consult `docs/codex-handoff.md` only when broader historical or architectural context is actually needed.

Treat current repository code and Git history as the source of truth. If docs differ from code, trust the code and report the discrepancy before changing architecture.

## Start every task

1. Check `git status` and current branch.
2. `git fetch origin`.
3. Inspect recent commits relevant to the task.
4. Identify the subsystem below and read its listed source-of-truth files first.
5. Follow direct imports/callers only when needed; do not scan the whole repo by default.
6. Reuse existing mechanisms; do not create parallel duplicate systems.
7. Make the smallest focused change that satisfies the task.
8. Run appropriate validation from `package.json`.
9. Commit the completed task.
10. Stop and report unless explicitly asked to continue.

## Context economy

- Do not read all of `docs/codex-handoff.md` by default.
- Do not re-investigate architecture already described here unless code/behavior contradicts it.
- Prefer current code + recent relevant commits over historical documentation.
- Expand outside the routed subsystem only when evidence requires it.
- Run broad repository searches only after the local subsystem fails to explain the problem.
- Do not inspect unrelated levels "just in case".

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

## Campaign routing

Main gameplay progression:

```text
Berlin -> Club -> Rhythm -> Level4 -> Boss
```

Dialogue / LevelComplete scenes sit between these stages as authored by the current flow.
Direct DEV routes must remain independently cold-loadable.

## Characters / casting

Start here:

- `src/game/characters/characterAssets.ts`
- `src/game/characters/characterRegistry.ts`
- `src/game/characters/characterSelection.ts`
- `src/game/characters/characterRef.ts`
- character manifest/discovery modules

Rules:

- playable characters are auto-discovered;
- no manual character registry;
- no per-character gameplay stats;
- reusable systems never hardcode a playable identity;
- story roles use existing CharacterRef/casting mechanisms.

## Berlin / Level 1

Start here:

- `src/game/scenes/BerlinScene.ts`
- `src/game/level/berlin/`
- Berlin score / collectible systems

Do not pull Club/Boss architecture into Berlin unless the task actually crosses scene boundaries.

## Club / Level 2

Start here:

- `src/game/scenes/ClubScene.ts`
- `src/game/level/club/clubRooms.ts`
- `src/game/level/club/clubStory.ts`
- `src/game/level/club/clubNpcAssets.ts`
- `src/game/level/club/ClubNpcLayer.ts`
- `src/game/level/club/clubNpcPlacement.ts`

Loading/prefetch:

- `src/game/systems/campaignPrefetch.ts`
- `src/game/systems/videoPrefetch.ts`
- `src/game/characters/characterAssets.ts`

Rules:

- room/NPC data stays data-driven;
- current-room critical assets may enter Phaser textures;
- distant next-stage prefetch should primarily warm HTTP cache;
- Club must work with zero Berlin prefetch / cold direct load;
- next-stage prefetch is an optimization, never a dependency.

## Rhythm / Level 3

Start here:

- `src/game/scenes/RhythmScene.ts`
- `src/game/rhythm/`
- rhythm track/audio timing modules

Rhythm owns special Web Audio pause/resume behavior.

## Level 4

Start here:

- `src/game/scenes/Level4Scene.ts`
- `src/game/level/level4/`
- `src/game/systems/designSpace.ts`
- shared scene-layout/editor modules when placement is involved

World-space positions use canonical design space, not live viewport width.

## Boss

Start here:

- `src/game/scenes/BossScene.ts`
- `src/game/boss/`
- `src/game/boss/EmeraldLayer.ts`
- attack/director/timeline modules
- shared scene-layout persistence for authored objects

Rules:

- preserve existing attack director/timing unless the task explicitly changes combat;
- emerald lifecycle follows laser telegraph/active events;
- editor persistence must have one canonical source of truth.

## Dialogue

Start here:

- `src/game/scenes/DialogueScene.ts`
- `src/game/dialogue/DialogueStageViewport.ts`
- `src/game/dialogue/CurrentSceneView.ts`
- `src/game/dialogue/currentSceneSnapshot.ts`
- `src/game/dialogue/TalkingPortrait.ts`
- `src/game/dialogue/dialogueScripts.ts`
- dialogue cast/resolution modules

Rules:

- `DialogueStageViewport` owns shared left-panel framing/mask/seam behavior;
- fix framing/seam bugs there, not per dialogue;
- use existing CharacterRef/casting;
- do not create another dialogue rendering/editor system.

## Scene editor / persistence

Start here:

- `src/game/systems/editor/SceneEditorCore.ts`
- `src/game/systems/SceneEditor.ts`
- `src/game/systems/sceneLayout.ts`
- `src/game/systems/sceneLayoutSchema.ts`
- `vite/editorSavePlugin.ts`

Rules:

- reuse the shared editor;
- clone/remove are object capabilities, not scene-specific editor forks;
- persistence must round-trip through the canonical layout/save path.

## Pause / sound

Start here:

- `src/game/systems/pause/`

Global by default. Scenes opt out explicitly.
Do not introduce scene-name allowlists.

## Performance / asset loading

Start here:

- `src/game/systems/campaignPrefetch.ts`
- `src/game/systems/videoPrefetch.ts`
- `src/game/characters/characterAssets.ts`
- owning scene `preload()`
- owning asset manifest

Rules:

- demand-driven loading;
- next-stage prefetch is an optimization, never a dependency;
- do not preload full gameplay bundles for stationary NPCs;
- do not decode the whole future campaign into Phaser textures.

## Scope shortcuts

If the task says:

- **Level 2 loading** -> Club + prefetch cluster first.
- **dialogue gap/seam** -> `DialogueStageViewport` / shared dialogue layout first.
- **dialogue animation/editor** -> Dialogue + relevant actor/editor integration.
- **boss emeralds** -> Boss / `EmeraldLayer` / director / persistence only.
- **character asset bug** -> character architecture first.

For deeper historical context, validation history, old branch state, or detailed design rationale, consult `docs/codex-handoff.md` only as needed.
