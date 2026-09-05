import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BOSS_ARENA,
  BOSS_EMERALDS,
  BOSS_PLAYER,
  BOSS_SCORING,
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
  stableBodyMetrics,
  type CollectibleBox,
} from '../src/game/boss/emeraldField';
import { bossEmeraldWindowSceneKey } from '../src/game/boss/bossEmeraldWindows';
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
const PLAYER_HALF_WIDTH = 37;
const authored = (): EmeraldSpot[] =>
  getAuthoredEmeraldSpots(bossEmeraldWindowSceneKey('BossScene', 'attack-00'));

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

  it('places every shipped spot at leg height, within a sensible spread of the group', () => {
    // Authored x is relative to the player anchor captured at the telegraph's
    // start (EmeraldLayer translates the whole group there at runtime), so it
    // is no longer an absolute arena position — bound it against the arena's
    // own width instead of its absolute edges.
    const arenaWidth = arena.maxX - arena.minX;
    for (const spot of authored()) {
      expect(Math.abs(spot.x)).toBeLessThanOrEqual(arenaWidth / 2);
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

describe('emerald lifecycle scoring', () => {
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
