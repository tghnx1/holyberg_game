# Holyberg Game — Codex Handoff

> Repository: `tghnx1/holyberg_game`  
> Stack: Phaser + TypeScript + Vite + Vitest + GitHub Pages

This file contains durable architectural context only.

Use `AGENTS.md` as the primary task router. It tells you which subsystem and files to inspect first. Do not read this whole file for a narrow task unless broader context is actually needed.

The current repository and Git history are always the source of truth. If this document disagrees with code, trust the code and report/update stale documentation rather than designing around it.

## Campaign shape

High-level gameplay order:

```text
Boot
→ Character Select
→ opening dialogue
→ Berlin / Level 1
→ Club / Level 2
→ Rhythm / Level 3
→ Level 4
→ Boss
→ final dialogue/result flow
```

`DialogueScene` and `LevelCompleteScene` are inserted between gameplay stages where the current code requires them.

Direct DEV routes exist via query params. Every later scene must remain independently cold-loadable; previous scenes may warm cache but must never be required for correctness.

## Character architecture

Do not redesign this unless explicitly requested.

Playable characters live under:

```text
public/assets/players/<CharacterName>/
  gameplay/
    idle.png
    run/01.png ...
    jump/01.png ...
    crouch/01.png ...
    damage/01.png ...
    walk/01.png ...      # optional/discovered
  dialogue/
    portrait/idle.png
    portrait/talk.png
    poses/metro_sit.png
    appear/01.png ...    # optional
```

Characters are discovered automatically. Do not add a parallel manual registry.

Core invariants:

- character selection is visual only;
- no character-specific gameplay stats;
- reusable gameplay/dialogue code must not hardcode a playable identity;
- use the existing `CharacterRef`/casting system for player, role, and explicit-character references;
- story casting belongs in story/casting configuration, not character metadata;
- preserve authored character presentation metadata such as foot-gap overrides.

Conceptual `CharacterRef`:

```ts
type CharacterRef =
  | { type: 'player' }
  | { type: 'role'; role: CharacterRoleId }
  | { type: 'character'; characterId: string };
```

Magician casting is an existing story rule; resolve it through the current casting system rather than hardcoding names in reusable rendering.

## Dialogue architecture

Dialogue speaker resolution follows the existing `CharacterRef` path.

Use:

```text
playerRef()             → selected player
roleRef('magician')     → story role
characterRef('<id>')    → intentionally fixed concrete character
```

Do not introduce a second dialogue renderer/editor architecture.

Shared left-stage framing belongs to `DialogueStageViewport`; seam/mask/framing bugs should be fixed there rather than with per-dialogue offsets.

Current-scene dialogue may use captured scene content where appropriate, but animated/editable actors should reuse existing character locomotion/editor systems instead of duplicating animation logic.

Dialogue input invariant:

```text
short SPACE      → same advance path as mobile tap
hold SPACE ~600ms+ → full-dialogue skip
```

One press must not trigger both paths.

## Scene editor and persistence

The shared editor core is the canonical implementation. Reuse it.

Core rules:

- selection/drag/resize/copy/delete behavior belongs in shared editor mechanisms;
- scene objects opt into clone/remove capabilities rather than scenes creating custom clipboard/delete implementations;
- persistent transforms round-trip through the existing scene-layout store/save plugin;
- delete must remove persistent layout state when an object is truly deleted;
- do not create bespoke persistence endpoints if the existing layout path can represent the data.

## Coordinate spaces

The game uses `Phaser.Scale.EXPAND` from a 720x720 base.

The important invariant is the distinction between world space and screen space.

### World space

Actors, scenery, triggers, fall zones, camera targets, gameplay limits and authored Level 4/Boss positions must resolve against canonical design space (`src/game/systems/designSpace.ts`), not live `camera.width` / `scale.width`.

A wider landscape viewport reveals more world horizontally; it must not move authored world positions.

### Screen space

HUD, pause controls, touch zones and dialogue panel geometry follow the live viewport.

`sceneLayout.json` may store `xRatio`/`yRatio`; the consumer defines what those ratios are relative to. Dialogue layout uses its live panel; world-space consumers use canonical design space.

A camera stop is stored as the world x-coordinate the frame centers on, not as raw `scrollX`.

## Pause / sound

Global pause infrastructure lives under:

```text
src/game/systems/pause/
```

It is automatic by default. Non-game scenes opt out explicitly.

Do not introduce hardcoded scene-name allowlists.

Rhythm has special pause/resume handling because its Web Audio lifecycle is outside the normal Phaser scene update loop.

Mute is session/global state.

## Asset loading and prefetch

Asset loading is demand-driven and idempotent.

Important invariant:

```text
prefetch = optimization
scene preload = correctness
```

A scene must work on a cold direct route even if no previous scene prefetched anything.

Campaign prefetch should primarily warm browser HTTP cache for future stages. Avoid eagerly decoding/registering the entire future campaign into Phaser textures or keeping multiple future video decoders alive.

For Club specifically:

- selected walking player needs only the locomotion assets the scene actually uses;
- stationary story NPCs should not require full gameplay bundles;
- first-visible room content may be blocking/critical;
- later animation frames and future-room assets may load progressively;
- poster fallback must make video startup non-blocking.

## Club / Level 2

Room/NPC/story definitions are data-driven. Reuse the existing Club modules and placement mechanisms rather than adding room-specific logic in `ClubScene`.

Club video/background startup must not block scene playability. A missing or failed background prefetch must not prevent Level 2 from entering `create()` and becoming usable.

## Level 4

Level 4 uses canonical world coordinates and shared editor/persistence infrastructure.

Preserve existing door, NPC, magician, gap/ending and camera-flow behavior unless the task explicitly changes it.

Do not derive Level 4 world positions from live viewport width.

## Boss

Preserve the existing Boss attack director/timing/collision architecture unless a task explicitly changes combat behavior.

Boss emeralds are authored scene objects whose runtime visibility/lifecycle is driven by attack telegraph/active events. Any per-window authoring must use the existing stable attack/window identity and canonical persistence path; avoid fallback/global/random paths that can leak or duplicate authored objects.

## Validation policy

Choose validation proportional to the task.

For focused changes, prefer targeted tests plus typecheck/lint where appropriate. Run full tests/build when the task or final integration warrants it.

Do not spend time on browser automation or screenshot/manual visual verification unless explicitly requested; the user may perform visual/runtime verification separately.

## Documentation discipline

Keep this file short and durable.

Do not add:

- current branch names;
- temporary agent/worktree state;
- one-off bug status;
- historical validation logs;
- commit-by-commit progress;
- transient asset counts or timings.

Those belong in Git history, issues, or task reports. Update this file only when a durable architectural rule changes.
