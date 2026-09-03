/**
 * Which authored emeralds a telegraph offers, and what counts as picking one up.
 *
 * Pure, like the rest of `src/game/boss/`: the selection is a function of the
 * spots a designer placed, where the player is standing and how long the
 * telegraph gives them, so fairness can be asserted for every attack of a
 * whole fight without a running scene. There is no randomness left — the
 * arena's emeralds are authored, so a given fight offers the same emeralds
 * every time it is played.
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
import { BOSS_ARENA, BOSS_EMERALDS, BOSS_PLAYER } from './bossConfig';
import type { EmeraldSpot } from './bossEmeraldSpots';
import type { ArenaBounds } from './types';

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

export interface EmeraldSelectionRequest {
  /** Where the *visible* player centre may travel, in world pixels. */
  reachable: ArenaBounds;
  /** Visible centre X of the player at the moment the telegraph starts. */
  playerCenterX: number;
  /** How long the player has before this attack fires. */
  telegraphMs: number;
  /**
   * How far past its own centre the player can still touch something: its
   * half-width plus the emerald's. Without it a spot beside a wall would be
   * ruled unreachable because no *centre* can stand on it, even though the
   * player plainly collects it by running into the wall.
   */
  pickupReachPx: number;
}

/**
 * How far the player can travel and still get back out, in world pixels.
 *
 * Uses the real run speed rather than a guessed number, so retuning movement
 * retunes the offer with it and an emerald can never be dangled out of reach.
 */
export function reachableDistancePx(telegraphMs: number): number {
  const travel = BOSS_PLAYER.moveSpeed * (Math.max(0, telegraphMs) / 1000);
  return travel * BOSS_EMERALDS.reachableFraction;
}

/** The band a spot must fall in to be offered: within reach, inside the arena. */
export function reachableBand(request: EmeraldSelectionRequest): ArenaBounds {
  const reach = reachableDistancePx(request.telegraphMs);
  const touch = Math.max(0, request.pickupReachPx);
  const minX = Math.max(request.reachable.minX - touch, request.playerCenterX - reach - touch);
  const maxX = Math.min(request.reachable.maxX + touch, request.playerCenterX + reach + touch);
  return minX > maxX ? { minX: maxX, maxX: minX } : { minX, maxX };
}

/**
 * The authored spots this telegraph puts on the table.
 *
 * Two rules, and only two. A spot must be close enough that the player could
 * run to it and still leave, which is what keeps every offer honest; and it
 * must not be so close that it is collected by standing still, which is what
 * keeps it an offer at all rather than a handout.
 */
export function selectTelegraphEmeralds(
  spots: readonly EmeraldSpot[],
  request: EmeraldSelectionRequest,
): EmeraldSpot[] {
  const band = reachableBand(request);
  if (band.maxX <= band.minX) return [];
  return spots.filter(
    (spot) =>
      spot.x >= band.minX &&
      spot.x <= band.maxX &&
      Math.abs(spot.x - request.playerCenterX) >= BOSS_EMERALDS.minPlayerDistancePx,
  );
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
