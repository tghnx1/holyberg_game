import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  emeraldSpotLayout,
  getAuthoredEmeraldSpots,
  isEmeraldId,
  nextEmeraldSpotId,
  persistEmeraldSpot,
  type EmeraldSpot,
} from '../src/game/boss/bossEmeraldSpots';
import {
  boxesOverlap,
  collectEmeralds,
  emeraldBox,
  playerPickupBox,
  reachableDistancePx,
  selectTelegraphEmeralds,
  stableBodyMetrics,
  type CollectibleBox,
} from '../src/game/boss/emeraldField';
import { visiblePlayerHalfWidth } from '../src/game/boss/bossPlayerMovement';
import { getCharacter, getPlayableCharacters } from '../src/game/characters/characterRegistry';
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

const SPOT_Y = BOSS_ARENA.floorY - BOSS_EMERALDS.floorOffsetPx;

/**
 * A controlled row of spots, for testing the selection rules.
 *
 * Deliberately not the shipped layout: those positions are authored in the
 * editor and are expected to change, so a rule pinned to them would fail the
 * moment someone rearranged the arena — which is the whole point of them being
 * editable.
 */
const grid = (count: number, first = 120, last = 1160): EmeraldSpot[] =>
  Array.from({ length: count }, (_, index) => ({
    id: emeraldSpotId(index + 1),
    x: first + ((last - first) * index) / (count - 1),
    y: SPOT_Y,
    scale: 1,
  }));

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
  it('ships an arena with emeralds in it', () => {
    // A count, not a layout: how many there are and where they sit is authored
    // in the editor and expected to change.
    const spots = authored();
    expect(spots.length).toBeGreaterThan(0);
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
      for (const spot of offer(grid(12), playerCenterX)) {
        const distance = Math.max(0, Math.abs(spot.x - playerCenterX) - PICKUP_REACH);
        expect(distance).toBeLessThanOrEqual(reachableDistancePx(LONGEST_TELEGRAPH_MS) + 1e-9);
        const travelMs = (distance / BOSS_PLAYER.moveSpeed) * 1000;
        expect(travelMs).toBeLessThan(LONGEST_TELEGRAPH_MS);
      }
    }
  });

  it('never offers one the player is already standing on', () => {
    for (let playerCenterX = 110; playerCenterX <= 1170; playerCenterX += 7) {
      for (const spot of offer(grid(12), playerCenterX)) {
        expect(Math.abs(spot.x - playerCenterX)).toBeGreaterThanOrEqual(
          BOSS_EMERALDS.minPlayerDistancePx,
        );
      }
    }
  });

  it('leaves nobody empty-handed: every position gets an offer, on any telegraph', () => {
    const spots = grid(12);
    for (const telegraphMs of [LONGEST_TELEGRAPH_MS, SHORTEST_TELEGRAPH_MS]) {
      for (let playerCenterX = 107; playerCenterX <= 1173; playerCenterX += 3) {
        expect(offer(spots, playerCenterX, telegraphMs).length).toBeGreaterThan(0);
      }
    }
  });

  it('offers a bigger spread on a generous telegraph than a tight one', () => {
    const spots = grid(12);
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
    const spots = grid(12);
    expect(offer(spots, 500)).toEqual(offer(spots, 500));
    expect(offer(spots, 500)).not.toEqual(offer(spots, 900));
  });

  it('offers nothing rather than cheating when there is no time or no room', () => {
    expect(offer(grid(12), 640, 0)).toEqual([]);
    expect(
      selectTelegraphEmeralds(grid(12), {
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
    const spots = grid(12);
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
  // A scene of its own, so these never depend on — or disturb — the arena
  // someone has actually laid out in `sceneLayout.json`.
  const SCENE = 'EmeraldAuthoringTest';

  beforeEach(() => {
    for (const spot of grid(4)) {
      setSceneObjectLayout(SCENE, spot.id, emeraldSpotLayout({ x: spot.x, y: spot.y }, spot.scale));
    }
    setSceneObjectLayout(SCENE, 'player', { xRatio: 0.1, yRatio: 0.01, scale: 1 });
  });
  afterEach(() => resetSceneLayout());

  const authoredIn = (): EmeraldSpot[] => getAuthoredEmeraldSpots(SCENE);
  const spotsInPayload = (): string[] =>
    Object.keys(buildSceneLayoutPayload(SCENE)[SCENE] ?? {}).filter(isEmeraldId);

  it('saves a moved emerald as a world point, not a screen fraction', () => {
    const moved = { x: 812, y: 590 };
    setSceneObjectLayout(SCENE, 'emerald-01', {
      ...layoutRatiosFromDesignPoint(moved),
      scale: 1,
    });
    const reloaded = authoredIn().find((spot) => spot.id === 'emerald-01');
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

    setSceneObjectLayout(SCENE, copyId, {
      ...layoutRatiosFromDesignPoint({ x: 400, y: SPOT_Y }),
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
    removeSceneObjectLayout(SCENE, 'emerald-03');
    expect(spotsInPayload()).not.toContain('emerald-03');
    expect(authoredIn().map((spot) => spot.id)).not.toContain('emerald-03');
    // The rest of the arena is untouched by one deletion.
    expect(spotsInPayload()).toContain('emerald-02');
    expect(spotsInPayload()).toContain('emerald-04');
  });

  it('leaves the player and boss entries alone, which have no delete at all', () => {
    removeSceneObjectLayout(SCENE, 'emerald-01');
    expect(buildSceneLayoutPayload(SCENE)[SCENE]?.player).toBeDefined();
  });

  it('writes a payload the save route will accept', () => {
    setSceneObjectLayout(SCENE, 'emerald-01', {
      ...layoutRatiosFromDesignPoint({ x: 1160, y: SPOT_Y }),
      scale: 2.5,
    });
    expect(() => validateSceneLayout(buildSceneLayoutPayload(SCENE))).not.toThrow();
  });

  it('honours an authored scale when the emerald is read back', () => {
    setSceneObjectLayout(SCENE, 'emerald-02', {
      ...layoutRatiosFromDesignPoint({ x: 300, y: SPOT_Y }),
      scale: 1.8,
    });
    const spot = authoredIn().find((entry) => entry.id === 'emerald-02');
    expect(spot?.scale).toBe(1.8);
    expect(emeraldBox(spot!).halfWidth).toBeCloseTo(BOSS_EMERALDS.halfSizePx * 1.8);
  });

  it('round-trips move, two pastes, delete and resize through P payload and disk reload', () => {
    const beforeIds = spotsInPayload();
    const firstCopyId = nextEmeraldSpotId(new Set(beforeIds));
    const secondCopyId = nextEmeraldSpotId(new Set([...beforeIds, firstCopyId]));

    persistEmeraldSpot(SCENE, { id: 'emerald-01', x: 812, y: 566, scale: 1 });
    persistEmeraldSpot(SCENE, { id: firstCopyId, x: 620, y: 572, scale: 1.25 });
    persistEmeraldSpot(SCENE, { id: secondCopyId, x: 704, y: 548, scale: 0.8 });
    removeSceneObjectLayout(SCENE, 'emerald-02');
    persistEmeraldSpot(SCENE, { id: 'emerald-03', x: 940, y: 558, scale: 1.75 });

    // P -> validated endpoint payload -> merge with the existing JSON file.
    const payload = validateSceneLayout(buildSceneLayoutPayload(SCENE));
    const disk = JSON.parse(
      JSON.stringify({ OtherScene: { scenery: { xRatio: 0.5 } }, ...payload }),
    ) as Parameters<typeof resetSceneLayout>[0];

    // Reload the same serialized data as the sceneLayout module's source.
    resetSceneLayout(disk);
    const reloaded = getAuthoredEmeraldSpots(SCENE);
    expect(reloaded.map((spot) => spot.id).sort()).toEqual(
      ['emerald-01', 'emerald-03', 'emerald-04', firstCopyId, secondCopyId].sort(),
    );
    expect(reloaded.find((spot) => spot.id === 'emerald-01')).toMatchObject({ x: 812, y: 566 });
    expect(reloaded.find((spot) => spot.id === 'emerald-03')?.scale).toBeCloseTo(1.75);
    expect(reloaded.find((spot) => spot.id === firstCopyId)).toMatchObject({
      x: 620,
      y: 572,
      scale: 1.25,
    });
    expect(reloaded.find((spot) => spot.id === secondCopyId)).toMatchObject({
      x: 704,
      y: 548,
      scale: 0.8,
    });
    expect(reloaded.some((spot) => spot.id === 'emerald-02')).toBe(false);
  });
});

describe('the pickup box around the player', () => {
  const atmos = getCharacter('atmos');
  const boxAt = (centerX: number, presentationScale = 1) =>
    playerPickupBox(atmos, { centerX, presentationScale });
  const spotAt = (x: number, y = BOSS_ARENA.floorY - BOSS_EMERALDS.floorOffsetPx): EmeraldSpot => ({
    id: 'emerald-01',
    x,
    y,
    scale: 1,
  });
  /** How far an emerald's centre can be from the player's and still count. */
  const reach = (presentationScale = 1): number =>
    boxAt(0, presentationScale).halfWidth + BOSS_EMERALDS.halfSizePx;

  it('is far narrower than the width the arena walls the player in with', () => {
    // The bug: this *was* the movement width, which is the widest pose a
    // character has, because no pose may clip a wall. On every character that
    // is the damage frame, arms flung out.
    const movement = visiblePlayerHalfWidth(atmos, 1);
    expect(boxAt(0).halfWidth).toBeLessThan(movement / 2);
  });

  it('sits inside the drawn body, so an emerald has to overlap the character', () => {
    const idle = stableBodyMetrics(atmos);
    const drawnHalfWidth = idle.halfWidth * idle.poseScale;
    expect(boxAt(0).halfWidth).toBeLessThan(drawnHalfWidth);
    expect(boxAt(0).halfWidth).toBeGreaterThan(drawnHalfWidth * 0.4);
  });

  it('does not collect an emerald standing clearly beside the player', () => {
    const idle = stableBodyMetrics(atmos);
    const drawnHalfWidth = idle.halfWidth * idle.poseScale;
    // A clear gap between the drawn bodies: the emerald's own edge is 20px
    // past where the character's silhouette ends.
    const clearlyBeside = drawnHalfWidth + BOSS_EMERALDS.halfSizePx + 20;
    expect(boxesOverlap(emeraldBox(spotAt(clearlyBeside)), boxAt(0))).toBe(false);
  });

  it('still collects one the player is running through', () => {
    expect(boxesOverlap(emeraldBox(spotAt(0)), boxAt(0))).toBe(true);
    // Touching at the edges of the two drawn shapes still counts.
    expect(boxesOverlap(emeraldBox(spotAt(reach() - 2)), boxAt(0))).toBe(true);
  });

  it('does not sweep up two emeralds the player is standing between', () => {
    // Two placed a body's width apart, the player parked exactly between them.
    const separation = 120;
    const left = spotAt(-separation / 2);
    const right = spotAt(separation / 2);
    const player = boxAt(0);
    expect(boxesOverlap(emeraldBox(left), player)).toBe(false);
    expect(boxesOverlap(emeraldBox(right), player)).toBe(false);
    // Each is collected by actually moving onto it.
    expect(boxesOverlap(emeraldBox(left), boxAt(left.x))).toBe(true);
    expect(boxesOverlap(emeraldBox(right), boxAt(right.x))).toBe(true);
  });

  it('would have swept up both before this, from a step away', () => {
    // Guards the regression rather than just the fix: the old box reached
    // 117px from an emerald's centre, so a 120px gap was a double pickup.
    const oldHalfWidth = visiblePlayerHalfWidth(atmos, 1);
    const oldReach = oldHalfWidth + BOSS_EMERALDS.halfSizePx;
    expect(oldReach).toBeGreaterThan(60);
    expect(reach()).toBeLessThan(oldReach / 2);
  });

  it('follows the visible sprite, authored offset and all', () => {
    // The centre is passed in from the drawn sprite, which already carries the
    // editor's offset, so the box cannot drift away from the character.
    expect(boxAt(812).centerX).toBe(812);
    expect(boxAt(-40).centerX).toBe(-40);
  });

  it('grows and shrinks with the editor-authored player scale', () => {
    expect(boxAt(0, 2).halfWidth).toBeCloseTo(boxAt(0, 1).halfWidth * 2);
    expect(boxAt(0, 0.5).halfHeight).toBeCloseTo(boxAt(0, 1).halfHeight / 2);
    // A mirrored character is not a negative-width one.
    expect(boxAt(0, -1.5).halfWidth).toBeCloseTo(boxAt(0, 1.5).halfWidth);
  });

  it('stands on the floor and reaches roughly head height, never the tall frame', () => {
    const box = boxAt(0);
    const feet = box.centerY + box.halfHeight;
    expect(feet).toBeCloseTo(BOSS_ARENA.floorY);
    const head = box.centerY - box.halfHeight;
    // Tall enough to cover an emerald at leg height...
    expect(head).toBeLessThan(BOSS_ARENA.floorY - BOSS_EMERALDS.floorOffsetPx);
    // ...and shorter than the padded canvas the sprite is drawn on.
    const idle = stableBodyMetrics(atmos);
    expect(box.halfHeight * 2).toBeLessThan(idle.height * idle.poseScale);
  });

  it('ignores an emerald hanging above the character', () => {
    const box = boxAt(0);
    const overhead = spotAt(0, box.centerY - box.halfHeight - BOSS_EMERALDS.halfSizePx - 10);
    expect(boxesOverlap(emeraldBox(overhead), box)).toBe(false);
  });

  it('is the same box whichever animation frame is showing', () => {
    // Nothing about it reads the live frame, so a run cycle's wide arm frame
    // and a damage pose cannot change it.
    const first = boxAt(500);
    const second = boxAt(500);
    expect(first).toEqual(second);
  });

  it('gives every playable character a sensible pickup width', () => {
    for (const character of getPlayableCharacters()) {
      const box = playerPickupBox(character, { centerX: 0, presentationScale: 1 });
      const metrics = stableBodyMetrics(character);
      expect(box.halfWidth).toBeGreaterThan(0);
      expect(box.halfWidth).toBeLessThan(metrics.halfWidth * metrics.poseScale);
      expect(box.halfWidth).toBeLessThan(visiblePlayerHalfWidth(character, 1));
      expect(box.halfHeight).toBeGreaterThan(BOSS_EMERALDS.floorOffsetPx / 2);
    }
  });

  it('reads a resting pose, not the widest one, for every character', () => {
    for (const character of getPlayableCharacters()) {
      const widestPose = visiblePlayerHalfWidth(character, 1);
      const resting = stableBodyMetrics(character);
      expect(resting.halfWidth * resting.poseScale).toBeLessThan(widestPose);
    }
  });
});
