# Holyberg Game — Codex Handoff

> Repository: `tghnx1/holyberg_game`
>
> Stack: Phaser + TypeScript + Vite + Vitest + GitHub Pages
>
> This is project context, not a substitute for inspecting the repository. If code differs from this file, trust the current repository and report the discrepancy before changing architecture.

## Start every task

1. Check `git status`.
2. Check the current branch.
3. `git fetch origin`.
4. Inspect recent commits.
5. Read the relevant existing modules first.
6. Reuse existing systems before creating new ones.
7. Make the smallest focused change.
8. Run validation.
9. Commit.
10. Stop and report unless explicitly asked to continue.

For parallel work, do not assume another Codex chat can see this chat. Git branches/commits are the source of truth.

## Current game flow

```text
BootScene
→ CharacterSelectScene
→ DialogueScene
→ BerlinScene
→ LevelCompleteScene
→ ClubScene
→ LevelCompleteScene
→ RhythmScene
→ LevelCompleteScene
→ BossScene
→ ResultScene
```

Direct DEV routes also exist via query params.

# Character architecture — COMPLETE

Do not redesign this unless explicitly asked.

Characters live under:

```text
public/assets/players/<CharacterName>/
```

Canonical layout:

```text
gameplay/
  idle.png
  run/01.png ...
  jump/01.png ...
  crouch/01.png ...
  damage/01.png ...
  walk/01.png ...       # optional/discovered

dialogue/
  portrait/idle.png
  portrait/talk.png
  poses/metro_sit.png
  appear/01.png ...     # optional
```

Characters are discovered automatically at Vite/build time.

A valid playable character folder should automatically feed Character Select, Berlin, Club, Boss, player-relative dialogue, and the metro seated player.

Existing systems include:

```text
CharacterRegistry
CharacterSelection
CharacterAssetLoader
CharacterRef
CastingRules
CharacterResolver
generic character animation helpers
```

Character refs:

```ts
type CharacterRef =
  | { type: 'player' }
  | { type: 'role'; role: CharacterRoleId }
  | { type: 'character'; characterId: string };
```

Meaning:

```text
player     → currently selected playable character
role       → story role resolved through casting rules
character  → explicit concrete character, never recast
```

Casting is explicit story configuration, not automatic discovery.

Current important story rule:

```text
magician
default → Disus
if player is Disus → Atmos
allowSameAsPlayer = false
```

Do not put story casting into character metadata.

Do not add gameplay stats to `CharacterDefinition`.

Character choice must not affect speed, physics, gravity, jump strength, collision body, score, timing, or game balance.

Shared animation timing:

```text
run cycle = 552 ms
crouch cycle = 330 ms
jump airborne animation = 280 ms
landing hold = 120 ms
```

Atmos has authored run foot-gap visual overrides in `character.json`. Preserve them.

Do not reintroduce Atmos-specific gameplay constants.

# Dialogue architecture

Main-character dialogue should use:

```ts
playerRef()
```

Do not hardcode Atmos for protagonist dialogue.

Story role:

```ts
speaker: roleRef('magician')
```

Fixed concrete NPC only when intentionally required:

```ts
speaker: characterRef('disus')
```

Resolution conceptually:

```text
line speaker
→ script defaultSpeaker
→ CharacterRef resolver
→ CharacterDefinition
→ portrait/name
```

Metro cast is generic:

```text
seatedActor → playerRef()
arrivingActor → roleRef('magician')
```

Reusable dialogue/rendering code should not hardcode Atmos/Disus identity.

# Pause / sound system

Global pause infrastructure exists under:

```text
src/game/systems/pause/
```

It is intentionally automatic.

Do not add a hardcoded scene-name allowlist.

Default: scenes are pausable. Non-game screens explicitly opt out, e.g. `static pausable = false`.

Pause menu:

```text
RESUME
RESTART
SOUND ON/OFF
```

Keyboard:

```text
ESC / P
```

Visible pause + sound HUD controls exist.

Rhythm has special pause/resume hooks because its raw Web Audio lives outside the Phaser scene update loop.

Mute is global/session-wide.

Current HUD intent:

```text
top-right:
SCORE   pause   sound

mobile:
larger touch controls

desktop fullscreen:
whole HUD group shifted left enough to avoid the fullscreen exit X
```

# Dialogue input

```text
short SPACE → same path as mobile tap
hold SPACE ~600 ms+ → full dialogue skip
```

One press must not trigger both.

# Level 2 / Club

Existing room assets include:

```text
public/assets/level_2/
  animation_1.mp4
  animation_2.mp4
  animation_3.mp4
  room_1_poster.webp
  room_2_poster.webp
```
