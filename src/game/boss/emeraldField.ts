/**
 * Where a telegraph's emeralds appear, and what counts as picking one up.
 *
 * Pure, like the rest of `src/game/boss/`: placement is a function of the
 * arena, the telegraph the player has been given and a seeded random source,
 * so a fairness rule can be asserted for every attack of a whole fight without
 * a running scene.
 *
 * Deliberately separate from `attackRuntime`'s beam geometry. An emerald is
 * never placed relative to a laser and never consulted when resolving damage;
 * the two systems share only the arena they sit in, so tuning one cannot
 * quietly change where the other lands.
 */
import { BOSS_ARENA, BOSS_EMERALDS, BOSS_PLAYER } from './bossConfig';
import type { ArenaBounds } from './types';

export interface Emerald {
  /** Unique within a fight, so a renderer can track sprites across frames. */
  id: number;
  x: number;
  y: number;
}

/** An axis-aligned box in world space; both sides of a pickup test. */
export interface CollectibleBox {
  centerX: number;
  centerY: number;
  halfWidth: number;
  halfHeight: number;
}

export interface EmeraldSpawnRequest {
  /** Where the *visible* player centre may travel, in world pixels. */
  reachable: ArenaBounds;
  /** Visible centre X of the player at the moment the telegraph starts. */
  playerCenterX: number;
  /** How long the player has before this attack fires. */
  telegraphMs: number;
  /** Seeded, so a fight with a fixed seed places identical emeralds. */
  random: () => number;
  /** First id to hand out; ids stay unique across a fight. */
  nextId: number;
}

/**
 * How far the player can travel and still get back out, in world pixels.
 *
 * Uses the real run speed rather than a guessed number, so retuning movement
 * retunes placement with it and an emerald can never drift out of reach.
 */
export function reachableDistancePx(telegraphMs: number): number {
  const travel = BOSS_PLAYER.moveSpeed * (Math.max(0, telegraphMs) / 1000);
  return travel * BOSS_EMERALDS.reachableFraction;
}

/** The band an emerald may occupy: within reach, and inside the arena. */
export function reachableBand(request: EmeraldSpawnRequest): ArenaBounds {
  const reach = reachableDistancePx(request.telegraphMs);
  const minX = Math.max(request.reachable.minX, request.playerCenterX - reach);
  const maxX = Math.min(request.reachable.maxX, request.playerCenterX + reach);
  return minX > maxX ? { minX: maxX, maxX: minX } : { minX, maxX };
}

/**
 * The emeralds for one telegraph.
 *
 * Rejection sampling rather than fixed slots: it keeps placement varied while
 * still honouring "not on the player" and "not on each other", and it degrades
 * gracefully — a band too small for the requested count simply yields fewer
 * emeralds instead of stacking them or spilling out of the arena.
 */
export function planEmeraldSpawn(request: EmeraldSpawnRequest): Emerald[] {
  const band = reachableBand(request);
  const span = band.maxX - band.minX;
  if (span <= 0) return [];

  const { minPerAttack, maxPerAttack, minPlayerDistancePx, minSeparationPx } = BOSS_EMERALDS;
  const count =
    minPerAttack + Math.floor(request.random() * (maxPerAttack - minPerAttack + 1));
  const y = BOSS_ARENA.floorY - BOSS_EMERALDS.floorOffsetPx;

  const emeralds: Emerald[] = [];
  // Bounded: a cramped band gives up rather than looping forever.
  const attempts = count * 12;
  for (let attempt = 0; attempt < attempts && emeralds.length < count; attempt += 1) {
    const x = band.minX + request.random() * span;
    if (Math.abs(x - request.playerCenterX) < minPlayerDistancePx) continue;
    if (emeralds.some((placed) => Math.abs(placed.x - x) < minSeparationPx)) continue;
    emeralds.push({ id: request.nextId + emeralds.length, x, y });
  }
  return emeralds;
}

/** The pickup box of one emerald. */
export function emeraldBox(emerald: Emerald): CollectibleBox {
  return {
    centerX: emerald.x,
    centerY: emerald.y,
    halfWidth: BOSS_EMERALDS.halfSizePx,
    halfHeight: BOSS_EMERALDS.halfSizePx,
  };
}

/** Ordinary AABB overlap; both boxes are already in world space. */
export function boxesOverlap(a: CollectibleBox, b: CollectibleBox): boolean {
  return (
    Math.abs(a.centerX - b.centerX) <= a.halfWidth + b.halfWidth &&
    Math.abs(a.centerY - b.centerY) <= a.halfHeight + b.halfHeight
  );
}

/**
 * Splits a set into what the player just ran through and what is still out
 * there. Returning both halves keeps the caller from having to mutate a list
 * while iterating it.
 */
export function collectEmeralds(
  emeralds: readonly Emerald[],
  playerBox: CollectibleBox,
): { collected: Emerald[]; remaining: Emerald[] } {
  const collected: Emerald[] = [];
  const remaining: Emerald[] = [];
  for (const emerald of emeralds) {
    if (boxesOverlap(emeraldBox(emerald), playerBox)) collected.push(emerald);
    else remaining.push(emerald);
  }
  return { collected, remaining };
}
