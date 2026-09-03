import { afterEach, describe, expect, it } from 'vitest';
import { BossFightDirector } from '../src/game/boss/BossFightDirector';
import {
  ATTACK_TIMINGS,
  BOSS_ARENA,
  BOSS_EMERALDS,
  BOSS_PHASES,
  BOSS_PLAYER,
  BOSS_SCORING,
  MINIMUM_TELEGRAPH_MS,
} from '../src/game/boss/bossConfig';
import {
  emeraldSpotId,
  getAuthoredEmeraldSpots,
  isEmeraldId,
  nextEmeraldSpotId,
  type EmeraldSpot,
} from '../src/game/boss/bossEmeraldSpots';
import {
  boxesOverlap,
  collectEmeralds,
  emeraldBox,
  reachableDistancePx,
  selectTelegraphEmeralds,
  type CollectibleBox,
} from '../src/game/boss/emeraldField';
import type { ArenaBounds } from '../src/game/boss/types';
import { layoutRatiosFromDesignPoint } from '../src/game/systems/designSpace';
import {
  buildSceneLayoutPayload,
  removeSceneObjectLayout,
  resetSceneLayout,
  setSceneObjectLayout,
} from '../src/game/systems/sceneLayout';
import { validateSceneLayout } from '../src/game/systems/sceneLayoutSchema';

const arena: ArenaBounds = { minX: 70, maxX: 1210 };
/** Where the visible player's centre can actually stand, for a typical build. */
const reachable: ArenaBounds = { minX: 107, maxX: 1173 };
const PLAYER_HALF_WIDTH = 37;
const PICKUP_REACH = PLAYER_HALF_WIDTH + BOSS_EMERALDS.halfSizePx;

const telegraphMsFor = (scale: number): number =>
  Math.max(MINIMUM_TELEGRAPH_MS, Math.round(ATTACK_TIMINGS.aimedLaser.telegraphMs * scale));
const LONGEST_TELEGRAPH_MS = telegraphMsFor(Math.max(...BOSS_PHASES.map((p) => p.telegraphScale)));
const SHORTEST_TELEGRAPH_MS = telegraphMsFor(Math.min(...BOSS_PHASES.map((p) => p.telegraphScale)));

const authored = (): EmeraldSpot[] => getAuthoredEmeraldSpots('BossScene');

const offer = (
  spots: readonly EmeraldSpot[],
  playerCenterX: number,
  telegraphMs = LONGEST_TELEGRAPH_MS,
): EmeraldSpot[] =>
  selectTelegraphEmeralds(spots, {
    reachable,
    playerCenterX,
    telegraphMs,
    pickupReachPx: PICKUP_REACH,
  });

describe('authored emerald spots', () => {
  it('ships a set of spots the arena starts with', () => {
    const spots = authored();
    expect(spots.length).toBeGreaterThanOrEqual(8);
    expect(new Set(spots.map((spot) => spot.id)).size).toBe(spots.length);
    for (const spot of spots) expect(isEmeraldId(spot.id)).toBe(true);
  });

  it('reads them left to right, whatever order the file is in', () => {
    const xs = authored().map((spot) => spot.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('places every shipped spot inside the arena, at leg height', () => {
    for (const spot of authored()) {
      expect(spot.x).toBeGreaterThanOrEqual(arena.minX);
      expect(spot.x).toBeLessThanOrEqual(arena.maxX);
      // Above the floor but well below the player's head: no jump exists here.
      expect(spot.y).toBeLessThan(BOSS_ARENA.floorY);
      expect(BOSS_ARENA.floorY - spot.y).toBeLessThan(140);
    }
  });

  it('only claims ids that belong to emeralds', () => {
    expect(isEmeraldId('emerald-01')).toBe(true);
    expect(isEmeraldId(emeraldSpotId(7))).toBe(true);
    // Hand-written ids are as valid as generated ones.
    expect(isEmeraldId('emerald-left-wall')).toBe(true);
    for (const other of ['player', 'boss', 'toilet', 'emerald', 'emeralds', 'stall-door']) {
      expect(isEmeraldId(other)).toBe(false);
    }
  });
});

describe('what a telegraph offers', () => {
  it('offers only spots the player could run to and still leave', () => {
    for (let playerCenterX = 110; playerCenterX <= 1170; playerCenterX += 7) {
      for (const spot of offer(authored(), playerCenterX)) {
        const distance = Math.max(0, Math.abs(spot.x - playerCenterX) - PICKUP_REACH);
        expect(distance).toBeLessThanOrEqual(reachableDistancePx(LONGEST_TELEGRAPH_MS) + 1e-9);
        const travelMs = (distance / BOSS_PLAYER.moveSpeed) * 1000;
        expect(travelMs).toBeLessThan(LONGEST_TELEGRAPH_MS);
      }
    }
  });

  it('never offers one the player is already standing on', () => {
    for (let playerCenterX = 110; playerCenterX <= 1170; playerCenterX += 7) {
      for (const spot of offer(authored(), playerCenterX)) {
        expect(Math.abs(spot.x - playerCenterX)).toBeGreaterThanOrEqual(
          BOSS_EMERALDS.minPlayerDistancePx,
        );
      }
    }
  });

  it('leaves nobody empty-handed: every position gets an offer, on any telegraph', () => {
    const spots = authored();
    for (const telegraphMs of [LONGEST_TELEGRAPH_MS, SHORTEST_TELEGRAPH_MS]) {
      for (let playerCenterX = 107; playerCenterX <= 1173; playerCenterX += 3) {
        expect(offer(spots, playerCenterX, telegraphMs).length).toBeGreaterThan(0);
      }
    }
  });

  it('offers a bigger spread on a generous telegraph than a tight one', () => {
    const spots = authored();
    const generous = offer(spots, 640, LONGEST_TELEGRAPH_MS).length;
    const tight = offer(spots, 640, SHORTEST_TELEGRAPH_MS).length;
    expect(generous).toBeGreaterThan(tight);
  });

  it('counts a spot beside a wall, which no player centre can stand on', () => {
    // The whole point of pickupReachPx: the player collects it by running
    // into the wall, so ruling it unreachable would be wrong.
    const atWall: EmeraldSpot[] = [{ id: 'emerald-01', x: reachable.minX - 20, y: 578, scale: 1 }];
    expect(offer(atWall, reachable.minX + BOSS_EMERALDS.minPlayerDistancePx)).toHaveLength(1);
  });

  it('is the same offer every run: nothing about it is random', () => {
    const spots = authored();
    expect(offer(spots, 500)).toEqual(offer(spots, 500));
    expect(offer(spots, 500)).not.toEqual(offer(spots, 900));
  });

  it('offers nothing rather than cheating when there is no time or no room', () => {
    expect(offer(authored(), 640, 0)).toEqual([]);
    expect(
      selectTelegraphEmeralds(authored(), {
        reachable: { minX: 640, maxX: 640 },
        playerCenterX: 640,
        telegraphMs: LONGEST_TELEGRAPH_MS,
        pickupReachPx: 0,
      }),
    ).toEqual([]);
  });
});

describe('emerald collection', () => {
  const playerAt = (centerX: number, halfWidth = PLAYER_HALF_WIDTH): CollectibleBox => ({
    centerX,
    centerY: BOSS_ARENA.floorY - 80,
    halfWidth,
    halfHeight: 80,
  });
  const spotAt = (id: string, x: number, scale = 1): EmeraldSpot => ({
    id,
    x,
    y: BOSS_ARENA.floorY - BOSS_EMERALDS.floorOffsetPx,
    scale,
  });

  it('collects the one the player is standing on, and only that one', () => {
    const { collected, remaining } = collectEmeralds(
      [spotAt('emerald-01', 300), spotAt('emerald-02', 900)],
      playerAt(300),
    );
    expect(collected.map((spot) => spot.id)).toEqual(['emerald-01']);
    expect(remaining.map((spot) => spot.id)).toEqual(['emerald-02']);
  });

  it('uses a collectible box wider than the narrow laser hurtbox', () => {
    const grazeX = 300 + BOSS_PLAYER.hitHalfWidth + 12;
    expect(boxesOverlap(emeraldBox(spotAt('emerald-01', 300)), playerAt(grazeX))).toBe(true);
  });

  it('scales its reach with the player box it is given, not a constant', () => {
    const spot = spotAt('emerald-01', 500);
    const far = 500 + BOSS_EMERALDS.halfSizePx + 60;
    expect(boxesOverlap(emeraldBox(spot), playerAt(far, 30))).toBe(false);
    expect(boxesOverlap(emeraldBox(spot), playerAt(far, 70))).toBe(true);
  });

  it('grows the pickup box with an emerald authored larger', () => {
    const far = 500 + BOSS_EMERALDS.halfSizePx + 30;
    expect(boxesOverlap(emeraldBox(spotAt('emerald-01', 500, 1)), playerAt(far, 20))).toBe(false);
    expect(boxesOverlap(emeraldBox(spotAt('emerald-01', 500, 2.5)), playerAt(far, 20))).toBe(true);
  });

  it('ignores an emerald at a height the player never occupies', () => {
    const overhead: EmeraldSpot = { id: 'emerald-01', x: 300, y: BOSS_ARENA.floorY - 400, scale: 1 };
    expect(boxesOverlap(emeraldBox(overhead), playerAt(300))).toBe(false);
  });
});

describe('emerald lifecycle against the fight', () => {
  const bounds: ArenaBounds = { minX: 70, maxX: 1210 };

  /**
   * Mirrors what BossScene does with the director's events, so the rule under
   * test is the real wiring: offer on telegraph, hide on active.
   */
  function runFight(): { maxOffered: number; offers: number; liveDuringActive: number[] } {
    const director = new BossFightDirector(bounds, 1);
    const spots = authored();
    let offered = 0;
    let offers = 0;
    let maxOffered = 0;
    const liveDuringActive: number[] = [];
    let guard = 0;

    while (!director.snapshot.finished && guard < 100_000) {
      for (const event of director.update(16, 640)) {
        if (event.kind === 'telegraphStarted') {
          offered = offer(spots, 640, event.attack.timing.telegraphMs).length;
          offers += 1;
          maxOffered = Math.max(maxOffered, offered);
        }
        if (event.kind === 'attackActivated') offered = 0;
      }
      if (director.snapshot.activeAttacks.some((attack) => attack.phase === 'active')) {
        liveDuringActive.push(offered);
      }
      guard += 1;
    }
    return { maxOffered, offers, liveDuringActive };
  }

  it('offers a set for every telegraph and clears it the instant the laser fires', () => {
    const { maxOffered, offers, liveDuringActive } = runFight();
    expect(offers).toBeGreaterThan(10);
    expect(maxOffered).toBeGreaterThan(0);
    // Nothing survives into an active laser, a recovery, or the next attack.
    expect(liveDuringActive.every((count) => count === 0)).toBe(true);
  });

  it('keeps one named constant as the emerald value', () => {
    expect(BOSS_SCORING.emeraldScore).toBe(100);
  });
});

describe('authoring emeralds in the editor', () => {
  afterEach(() => resetSceneLayout());

  const spotsInPayload = (): string[] =>
    Object.keys(buildSceneLayoutPayload('BossScene').BossScene ?? {}).filter(isEmeraldId);

  it('saves a moved emerald as a world point, not a screen fraction', () => {
    const moved = { x: 812, y: 590 };
    setSceneObjectLayout('BossScene', 'emerald-01', {
      ...layoutRatiosFromDesignPoint(moved),
      scale: 1,
    });
    const reloaded = authored().find((spot) => spot.id === 'emerald-01');
    expect(reloaded?.x).toBeCloseTo(moved.x);
    expect(reloaded?.y).toBeCloseTo(moved.y);
  });

  it('keeps a pasted copy alongside the original rather than replacing it', () => {
    const before = spotsInPayload();
    const copyId = nextEmeraldSpotId(new Set(before));
    expect(before).toContain('emerald-01');
    expect(before).not.toContain(copyId);
    // A copy is just another emerald, and must survive a reload as one.
    expect(isEmeraldId(copyId)).toBe(true);

    setSceneObjectLayout('BossScene', copyId, {
      ...layoutRatiosFromDesignPoint({ x: 400, y: 578 }),
      scale: 1,
    });
    const after = spotsInPayload();
    expect(after).toContain('emerald-01');
    expect(after).toContain(copyId);
    expect(after).toHaveLength(before.length + 1);
    // And a paste of the paste collides with neither.
    expect(nextEmeraldSpotId(new Set(after))).not.toBe(copyId);
  });

  it('forgets a deleted emerald, so it stays gone across a reload', () => {
    expect(spotsInPayload()).toContain('emerald-03');
    removeSceneObjectLayout('BossScene', 'emerald-03');
    expect(spotsInPayload()).not.toContain('emerald-03');
    expect(authored().map((spot) => spot.id)).not.toContain('emerald-03');
    // The rest of the arena is untouched by one deletion.
    expect(spotsInPayload().length).toBeGreaterThan(5);
  });

  it('leaves the player and boss entries alone, which have no delete at all', () => {
    removeSceneObjectLayout('BossScene', 'emerald-01');
    const saved = buildSceneLayoutPayload('BossScene').BossScene ?? {};
    expect(saved.player).toBeDefined();
  });

  it('writes a payload the save route will accept', () => {
    setSceneObjectLayout('BossScene', 'emerald-01', {
      ...layoutRatiosFromDesignPoint({ x: 1160, y: 578 }),
      scale: 2.5,
    });
    expect(() => validateSceneLayout(buildSceneLayoutPayload('BossScene'))).not.toThrow();
  });

  it('honours an authored scale when the emerald is read back', () => {
    setSceneObjectLayout('BossScene', 'emerald-02', {
      ...layoutRatiosFromDesignPoint({ x: 300, y: 578 }),
      scale: 1.8,
    });
    const spot = authored().find((entry) => entry.id === 'emerald-02');
    expect(spot?.scale).toBe(1.8);
    expect(emeraldBox(spot!).halfWidth).toBeCloseTo(BOSS_EMERALDS.halfSizePx * 1.8);
  });
});
