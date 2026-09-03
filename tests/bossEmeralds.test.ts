import { describe, expect, it } from 'vitest';
import { BossFightDirector } from '../src/game/boss/BossFightDirector';
import {
  BOSS_ARENA,
  BOSS_EMERALDS,
  BOSS_PHASES,
  BOSS_PLAYER,
  BOSS_SCORING,
} from '../src/game/boss/bossConfig';
import {
  boxesOverlap,
  collectEmeralds,
  emeraldBox,
  planEmeraldSpawn,
  reachableDistancePx,
  type CollectibleBox,
} from '../src/game/boss/emeraldField';
import { createRandom } from '../src/game/boss/fightSequence';
import type { ArenaBounds } from '../src/game/boss/types';

const arena: ArenaBounds = { minX: 70, maxX: 1210 };
/** A typical phase-1 telegraph: 820ms of base windup at 1.35 scale. */
const TELEGRAPH_MS = 1107;

const spawn = (overrides: Partial<Parameters<typeof planEmeraldSpawn>[0]> = {}) =>
  planEmeraldSpawn({
    reachable: arena,
    playerCenterX: 640,
    telegraphMs: TELEGRAPH_MS,
    random: createRandom(1),
    nextId: 0,
    ...overrides,
  });

describe('emerald placement', () => {
  it('spawns a set inside the reachable arena, at leg height', () => {
    const emeralds = spawn();
    expect(emeralds.length).toBeGreaterThanOrEqual(BOSS_EMERALDS.minPerAttack);
    expect(emeralds.length).toBeLessThanOrEqual(BOSS_EMERALDS.maxPerAttack);
    for (const emerald of emeralds) {
      expect(emerald.x).toBeGreaterThanOrEqual(arena.minX);
      expect(emerald.x).toBeLessThanOrEqual(arena.maxX);
      // Above the floor but well below the player's head: no jump exists here.
      expect(emerald.y).toBeLessThan(BOSS_ARENA.floorY);
      expect(BOSS_ARENA.floorY - emerald.y).toBeLessThan(140);
    }
  });

  it('never places one outside the movement bounds it is given', () => {
    // A narrow band stands in for a large authored offset or a scaled-up
    // character, both of which shrink where the visible player can go.
    const narrow: ArenaBounds = { minX: 400, maxX: 700 };
    for (let seed = 1; seed <= 60; seed += 1) {
      for (const emerald of spawn({ reachable: narrow, random: createRandom(seed) })) {
        expect(emerald.x).toBeGreaterThanOrEqual(narrow.minX);
        expect(emerald.x).toBeLessThanOrEqual(narrow.maxX);
      }
    }
  });

  it('stays inside the distance the player can actually run in the telegraph', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const playerCenterX = 200 + (seed % 9) * 100;
      const emeralds = spawn({ playerCenterX, random: createRandom(seed) });
      for (const emerald of emeralds) {
        const distance = Math.abs(emerald.x - playerCenterX);
        expect(distance).toBeLessThanOrEqual(reachableDistancePx(TELEGRAPH_MS) + 1e-9);
        // Reachable with room to spare, so there is time to get out again.
        const travelTimeMs = (distance / BOSS_PLAYER.moveSpeed) * 1000;
        expect(travelTimeMs).toBeLessThan(TELEGRAPH_MS);
      }
    }
  });

  it('is reachable for every telegraph the real fight ever issues', () => {
    // The shortest telegraph in the fight is the fairness floor: if an emerald
    // is reachable within that, it is reachable in every phase.
    const shortest = Math.min(...BOSS_PHASES.map((phase) => 820 * phase.telegraphScale));
    for (let seed = 1; seed <= 40; seed += 1) {
      const emeralds = spawn({ telegraphMs: shortest, random: createRandom(seed) });
      for (const emerald of emeralds) {
        const travelMs = (Math.abs(emerald.x - 640) / BOSS_PLAYER.moveSpeed) * 1000;
        expect(travelMs).toBeLessThan(shortest);
      }
    }
  });

  it('never drops one in the player’s lap, or on top of another', () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const emeralds = spawn({ random: createRandom(seed) });
      for (const emerald of emeralds) {
        expect(Math.abs(emerald.x - 640)).toBeGreaterThanOrEqual(
          BOSS_EMERALDS.minPlayerDistancePx,
        );
      }
      for (let i = 0; i < emeralds.length; i += 1) {
        for (let j = i + 1; j < emeralds.length; j += 1) {
          expect(Math.abs(emeralds[i].x - emeralds[j].x)).toBeGreaterThanOrEqual(
            BOSS_EMERALDS.minSeparationPx,
          );
        }
      }
    }
  });

  it('varies placement across attacks rather than reusing one spot', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 20; seed += 1) {
      for (const emerald of spawn({ random: createRandom(seed) })) {
        positions.add(Math.round(emerald.x));
      }
    }
    expect(positions.size).toBeGreaterThan(20);
  });

  it('is deterministic: the same seed lays out the same emeralds', () => {
    const first = spawn({ random: createRandom(4242) });
    const second = spawn({ random: createRandom(4242) });
    expect(first).toEqual(second);
    expect(spawn({ random: createRandom(99) })).not.toEqual(first);
  });

  it('yields nothing rather than cheating when there is no room', () => {
    const pinned: ArenaBounds = { minX: 640, maxX: 640 };
    expect(spawn({ reachable: pinned })).toEqual([]);
    expect(spawn({ telegraphMs: 0 })).toEqual([]);
  });

  it('hands out ids that stay unique across attacks', () => {
    const first = spawn({ nextId: 0 });
    const second = spawn({ nextId: first.length, random: createRandom(2) });
    const ids = [...first, ...second].map((emerald) => emerald.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('emerald collection', () => {
  const playerAt = (centerX: number, halfWidth = 34): CollectibleBox => ({
    centerX,
    centerY: BOSS_ARENA.floorY - 80,
    halfWidth,
    halfHeight: 80,
  });

  it('collects an emerald the visible player is standing on, and only that one', () => {
    const emeralds = [
      { id: 1, x: 300, y: BOSS_ARENA.floorY - BOSS_EMERALDS.floorOffsetPx },
      { id: 2, x: 900, y: BOSS_ARENA.floorY - BOSS_EMERALDS.floorOffsetPx },
    ];
    const { collected, remaining } = collectEmeralds(emeralds, playerAt(300));
    expect(collected.map((emerald) => emerald.id)).toEqual([1]);
    expect(remaining.map((emerald) => emerald.id)).toEqual([2]);
  });

  it('uses a collectible box wider than the narrow laser hurtbox', () => {
    const emerald = { id: 1, x: 300, y: BOSS_ARENA.floorY - BOSS_EMERALDS.floorOffsetPx };
    // Just outside the torso strip a laser tests against, but plainly touching
    // the character on screen.
    const grazeX = 300 + BOSS_PLAYER.hitHalfWidth + 12;
    expect(boxesOverlap(emeraldBox(emerald), playerAt(grazeX))).toBe(true);
  });

  it('scales its reach with the player box it is given, not a constant', () => {
    const emerald = { id: 1, x: 500, y: BOSS_ARENA.floorY - BOSS_EMERALDS.floorOffsetPx };
    const far = 500 + BOSS_EMERALDS.halfSizePx + 60;
    expect(boxesOverlap(emeraldBox(emerald), playerAt(far, 30))).toBe(false);
    // A character authored twice as wide reaches it; nothing is hardcoded.
    expect(boxesOverlap(emeraldBox(emerald), playerAt(far, 70))).toBe(true);
  });

  it('ignores an emerald at a height the player never occupies', () => {
    const overhead = { id: 1, x: 300, y: BOSS_ARENA.floorY - 400 };
    expect(boxesOverlap(emeraldBox(overhead), playerAt(300))).toBe(false);
  });
});

describe('emerald lifecycle against the fight', () => {
  const bounds: ArenaBounds = { minX: 70, maxX: 1210 };

  /**
   * Mirrors what BossScene does with the director's events, so the rule under
   * test is the real wiring: spawn on telegraph, clear on active.
   */
  function runFight(): { maxLive: number; spawns: number; liveDuringActive: number[] } {
    const director = new BossFightDirector(bounds, 1);
    let live = 0;
    let spawns = 0;
    let maxLive = 0;
    const liveDuringActive: number[] = [];
    let guard = 0;

    while (!director.snapshot.finished && guard < 100_000) {
      for (const event of director.update(16, 640)) {
        if (event.kind === 'telegraphStarted') {
          live = planEmeraldSpawn({
            reachable: bounds,
            playerCenterX: 640,
            telegraphMs: event.attack.timing.telegraphMs,
            random: createRandom(1 + event.attack.id * 7919),
            nextId: 0,
          }).length;
          spawns += 1;
          maxLive = Math.max(maxLive, live);
        }
        if (event.kind === 'attackActivated') live = 0;
      }
      // Nothing may be alive while a laser is firing.
      if (director.snapshot.activeAttacks.some((attack) => attack.phase === 'active')) {
        liveDuringActive.push(live);
      }
      guard += 1;
    }
    return { maxLive, spawns, liveDuringActive };
  }

  it('spawns a set for every telegraph and clears it the instant the laser fires', () => {
    const { maxLive, spawns, liveDuringActive } = runFight();
    expect(spawns).toBeGreaterThan(10);
    expect(maxLive).toBeGreaterThan(0);
    // No emerald survives into an active laser, a recovery, or the next attack.
    expect(liveDuringActive.every((count) => count === 0)).toBe(true);
  });

  it('never leaves more than one attack’s worth of emeralds alive', () => {
    const { maxLive } = runFight();
    expect(maxLive).toBeLessThanOrEqual(BOSS_EMERALDS.maxPerAttack);
  });

  it('keeps one named constant as the emerald value', () => {
    expect(BOSS_SCORING.emeraldScore).toBe(100);
  });
});
