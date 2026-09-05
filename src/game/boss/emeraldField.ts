/**
 * What counts as picking up an emerald from the exact layout authored for the
 * active telegraph window.
 *
 * Deliberately separate from `attackRuntime`'s beam geometry. An emerald is
 * never placed relative to a laser and never consulted when resolving damage;
 * the two systems share only the arena they sit in, so tuning one cannot
 * quietly change where the other lands.
 */
import {
  resolveGameplayScale,
  type CharacterAssetRef,
  type CharacterDefinition,
  type CharacterGameplayPose,
} from '../characters/characterManifest';
import { BOSS_ARENA, BOSS_EMERALDS } from './bossConfig';
import type { EmeraldSpot } from './bossEmeraldSpots';

/** An axis-aligned box in world space; both sides of a pickup test. */
export interface CollectibleBox {
  centerX: number;
  centerY: number;
  halfWidth: number;
  halfHeight: number;
}

/**
 * The drawn size of a character standing still, in source pixels.
 *
 * A *stable reference pose*, deliberately, rather than whatever frame is on
 * screen. The arena's movement bounds take the widest pose a character has,
 * because no pose may clip a wall — but that pose is the damage frame, whose
 * arms are flung out three to four times wider than the standing body on every
 * character in the game. Sizing a pickup area from it lets the player collect
 * an emerald from a clear step away, and sweep up two at once by standing
 * between them.
 *
 * Idle is the pose to measure instead: it is what the character looks like at
 * rest, it is within a few pixels of the same width on every character here,
 * and it does not change from frame to frame, so the pickup area cannot
 * breathe with the run cycle.
 */
export function stableBodyMetrics(character: CharacterDefinition): {
  halfWidth: number;
  height: number;
  poseScale: number;
} {
  const pose = referencePose(character);
  const poseScale = resolveGameplayScale(character, pose.name);
  return { halfWidth: pose.frame.bodyHalfWidth, height: pose.frame.bodyHeight, poseScale };
}

/**
 * Idle where a character has one. The fallbacks pick the *narrowest* frame of
 * an animation rather than the first, so a character discovered without an
 * idle still gets a resting-width reference rather than a mid-stride one.
 */
function referencePose(character: CharacterDefinition): {
  frame: CharacterAssetRef;
  name: CharacterGameplayPose;
} {
  const { idle, run, damage } = character.gameplay;
  if (idle) return { frame: idle, name: 'idle' };
  const narrowestRun = narrowest(run);
  if (narrowestRun) return { frame: narrowestRun, name: 'run' };
  const narrowestDamage = narrowest(damage);
  if (narrowestDamage) return { frame: narrowestDamage, name: 'damage' };
  return {
    frame: { key: '', url: '', footGap: 0, bodyHalfWidth: 0, bodyHeight: 0 },
    name: 'idle',
  };
}

function narrowest(frames: readonly CharacterAssetRef[]): CharacterAssetRef | undefined {
  return frames.reduce<CharacterAssetRef | undefined>(
    (best, frame) => (!best || frame.bodyHalfWidth < best.bodyHalfWidth ? frame : best),
    undefined,
  );
}

/**
 * The box an emerald is collected with.
 *
 * Its own geometry, sharing nothing with the laser hurtbox (a narrow torso
 * strip, tuned for beams) or the arena's movement width (the widest pose,
 * tuned for walls). Both of those are right for their own job and wrong for
 * this one.
 *
 * Anchored to the arena floor rather than to the sprite's own y: the run cycle
 * lifts the figure off the floor line a few pixels per frame, and a pickup
 * area that bobbed with it would collect at slightly different heights
 * depending on which frame happened to be showing.
 */
export function playerPickupBox(
  character: CharacterDefinition,
  visual: { centerX: number; presentationScale: number },
): CollectibleBox {
  const body = stableBodyMetrics(character);
  const scale = body.poseScale * Math.abs(visual.presentationScale || 1);
  const halfWidth = body.halfWidth * scale * BOSS_EMERALDS.pickupWidthFactor;
  const height = body.height * scale * BOSS_EMERALDS.pickupHeightFactor;
  return {
    centerX: visual.centerX,
    centerY: BOSS_ARENA.floorY - height / 2,
    halfWidth: Math.max(halfWidth, 1),
    halfHeight: Math.max(height / 2, 1),
  };
}

/** The pickup box of one spot, sized by whatever scale it was authored at. */
export function emeraldBox(spot: EmeraldSpot): CollectibleBox {
  const half = BOSS_EMERALDS.halfSizePx * Math.abs(spot.scale || 1);
  return { centerX: spot.x, centerY: spot.y, halfWidth: half, halfHeight: half };
}

/** Ordinary AABB overlap; both boxes are already in world space. */
export function boxesOverlap(a: CollectibleBox, b: CollectibleBox): boolean {
  return (
    Math.abs(a.centerX - b.centerX) <= a.halfWidth + b.halfWidth &&
    Math.abs(a.centerY - b.centerY) <= a.halfHeight + b.halfHeight
  );
}

/**
 * Splits an offer into what the player just ran through and what is still out
 * there. Returning both halves keeps the caller from having to mutate a list
 * while iterating it.
 */
export function collectEmeralds(
  offered: readonly EmeraldSpot[],
  playerBox: CollectibleBox,
): { collected: EmeraldSpot[]; remaining: EmeraldSpot[] } {
  const collected: EmeraldSpot[] = [];
  const remaining: EmeraldSpot[] = [];
  for (const spot of offered) {
    if (boxesOverlap(emeraldBox(spot), playerBox)) collected.push(spot);
    else remaining.push(spot);
  }
  return { collected, remaining };
}
