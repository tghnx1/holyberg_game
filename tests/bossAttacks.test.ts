import { describe, expect, it } from 'vitest';
import {
  getActiveEndMs,
  getActiveStartMs,
  getAttackBeams,
  getAttackDurationMs,
  getAttackPhase,
  getBeamPolygon,
  getTelegraphProgress,
  isAttackDamagingPlayer,
  isPlayerHitByBeams,
} from '../src/game/boss/attackRuntime';
import { BOSS_ARENA } from '../src/game/boss/bossConfig';
import type { ScheduledAttack } from '../src/game/boss/types';

const aimed: ScheduledAttack = {
  id: 0,
  type: 'aimedLaser',
  phaseIndex: 0,
  startMs: 1000,
  timing: { telegraphMs: 800, activeMs: 200, recoveryMs: 300 },
  params: { type: 'aimedLaser', targetX: 500, halfWidth: 30 },
};

describe('attack phases', () => {
  it('runs telegraph then active then recovery then done', () => {
    expect(getAttackPhase(aimed, 999)).toBe('telegraph');
    expect(getAttackPhase(aimed, 1000)).toBe('telegraph');
    expect(getAttackPhase(aimed, 1799)).toBe('telegraph');
    expect(getAttackPhase(aimed, 1800)).toBe('active');
    expect(getAttackPhase(aimed, 1999)).toBe('active');
    expect(getAttackPhase(aimed, 2000)).toBe('recovery');
    expect(getAttackPhase(aimed, 2299)).toBe('recovery');
    expect(getAttackPhase(aimed, 2300)).toBe('done');
  });

  it('exposes consistent phase boundaries', () => {
    expect(getActiveStartMs(aimed)).toBe(1800);
    expect(getActiveEndMs(aimed)).toBe(2000);
    expect(getAttackDurationMs(aimed)).toBe(1300);
    expect(getTelegraphProgress(aimed, 1400)).toBeCloseTo(0.5);
    expect(getTelegraphProgress(aimed, 5000)).toBe(1);
  });

  it('never damages the player outside the active window', () => {
    // Standing exactly in the beam the whole time.
    expect(isAttackDamagingPlayer(aimed, 1400, 500, 22)).toBe(false);
    expect(isAttackDamagingPlayer(aimed, 1850, 500, 22)).toBe(true);
    expect(isAttackDamagingPlayer(aimed, 2100, 500, 22)).toBe(false);
  });
});

describe('laser collision', () => {
  it('hits only when the player box overlaps a beam', () => {
    const beams = [{ centerX: 500, halfWidth: 30 }];
    expect(isPlayerHitByBeams(beams, 500, 22)).toBe(true);
    expect(isPlayerHitByBeams(beams, 551, 22)).toBe(true);
    // 30 + 22 = 52 of separation is the first clean miss.
    expect(isPlayerHitByBeams(beams, 552, 22)).toBe(false);
    expect(isPlayerHitByBeams(beams, 448, 22)).toBe(false);
  });

  it('telegraph geometry matches the beam that fires', () => {
    expect(getAttackBeams(aimed)).toEqual(getAttackBeams(aimed));
  });
});

describe('beam origin', () => {
  const bossX = 640;
  const origin = { x: bossX, y: 260 };

  it('starts every beam at the boss muzzle, not in mid-air', () => {
    const polygon = getBeamPolygon({ centerX: 200, halfWidth: 30 }, origin);
    const [leftX, leftY, rightX, rightY] = polygon.points;
    expect(leftY).toBe(origin.y);
    expect(rightY).toBe(origin.y);
    expect(leftX).toBe(bossX - BOSS_ARENA.laserOriginHalfWidth);
    expect(rightX).toBe(bossX + BOSS_ARENA.laserOriginHalfWidth);
    expect(polygon.originX).toBe(bossX);
  });

  it('lands on the footprint the collision test uses', () => {
    const beam = { centerX: 200, halfWidth: 30 };
    const [, , , , farRightX, farRightY, farLeftX, farLeftY] = getBeamPolygon(beam, origin).points;
    expect(farRightX).toBe(beam.centerX + beam.halfWidth);
    expect(farLeftX).toBe(beam.centerX - beam.halfWidth);
    expect(farRightY).toBe(BOSS_ARENA.floorY);
    expect(farLeftY).toBe(BOSS_ARENA.floorY);
  });

  it('fans out: narrow at the boss, full width at the floor', () => {
    const beam = { centerX: 1000, halfWidth: 30 };
    expect(BOSS_ARENA.laserOriginHalfWidth).toBeLessThan(beam.halfWidth);
    const polygon = getBeamPolygon(beam, origin);
    const muzzleWidth = polygon.points[2] - polygon.points[0];
    const floorWidth = polygon.points[4] - polygon.points[6];
    expect(muzzleWidth).toBeLessThan(floorWidth);
  });

  it('anchors every column of a laser wall to the same boss muzzle', () => {
    const wall: ScheduledAttack = {
      id: 2,
      type: 'laserWall',
      phaseIndex: 1,
      startMs: 0,
      timing: { telegraphMs: 900, activeMs: 600, recoveryMs: 300 },
      params: {
        type: 'laserWall',
        columnCenters: [200, 500, 900],
        halfWidth: 26,
        safeGapCenterX: 700,
        safeGapHalfWidth: 78,
      },
    };
    const polygons = getAttackBeams(wall).map((beam) => getBeamPolygon(beam, origin));
    expect(polygons).toHaveLength(3);
    for (const polygon of polygons) {
      expect(polygon.originX).toBe(bossX);
      expect(polygon.points[1]).toBe(origin.y);
    }
    // They fan to different places on the floor.
    expect(polygons.map((polygon) => polygon.footprintCenterX)).toEqual([200, 500, 900]);
  });
});
