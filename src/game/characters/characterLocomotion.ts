import {
  loopedFrameIndex,
  RUN_CYCLE_MS,
  staticRunFrameIndex,
  WALK_CYCLE_MS,
  walkFrameIndex,
} from './characterAnimation';
import type {
  CharacterAssetRef,
  CharacterDefinition,
  CharacterGameplayPose,
} from './characterManifest';

/**
 * Frame and scale selection for the connective levels, where the player is
 * moved by hand rather than by the Berlin runner's physics.
 *
 * Those scenes only ever show a character standing still or travelling on
 * foot, and travelling on foot means *walking*: Level 2 crosses a club and
 * Level 4 crosses a toilet, neither of which is a run. The discovered
 * `gameplay/walk/` frames exist for exactly this and were previously drawn by
 * nothing — both scenes looped the run cycle instead.
 *
 * Shared so the two levels animate identically. A character with no walk set
 * falls back to its run frames rather than freezing, and the *pose* reported
 * for scaling follows whichever set is actually drawn, so
 * `resolveGameplayScale` keeps applying that pose's own override.
 */

/**
 * What a hand-moved actor can be doing in a connective level.
 *
 * `damage` is the scripted Level 4 toilet-to-Holyworld fall: every playable
 * character is guaranteed at least one `gameplay/damage` frame (it gates
 * `capabilities.playable`, the same guarantee the Berlin runner's hit-flash
 * already relies on in `Player.ts`/`BossPlayer.ts`), so drawing it here needs
 * no character-specific branch and works for whichever character is
 * currently selected.
 */
export type LocomotionMotion = 'idle' | 'walk' | 'damage';

/** True when this character has real walk artwork to draw. */
function hasWalkFrames(character: CharacterDefinition): boolean {
  return character.capabilities.walkAnimation && character.gameplay.walk.length > 0;
}

/**
 * The pose whose artwork `resolveLocomotionFrame` will draw, so callers scale
 * with the same pose they render. Never reports `walk` for a character that
 * has no walk frames.
 */
export function resolveLocomotionPose(
  character: CharacterDefinition,
  motion: LocomotionMotion,
): CharacterGameplayPose {
  if (motion === 'damage') return 'damage';
  if (motion !== 'walk') return character.gameplay.idle ? 'idle' : 'run';
  return hasWalkFrames(character) ? 'walk' : 'run';
}

/** The frame to draw for `motion` at wall-clock `now`. */
export function resolveLocomotionFrame(
  character: CharacterDefinition,
  motion: LocomotionMotion,
  now: number,
): CharacterAssetRef {
  const { idle, run, walk, damage } = character.gameplay;
  if (motion === 'damage') {
    // A static pose, not a cycle: the fall is meant to hold on one frame of
    // hurt for its whole duration, not loop the Berlin hit-flash animation.
    return damage[0] ?? idle ?? run[staticRunFrameIndex(run.length)];
  }
  if (motion === 'walk') {
    if (hasWalkFrames(character)) {
      return walk[walkFrameIndex(now, walk.length, WALK_CYCLE_MS)];
    }
    return run[loopedFrameIndex(now, run.length, RUN_CYCLE_MS)];
  }
  return idle ?? run[staticRunFrameIndex(run.length)];
}
