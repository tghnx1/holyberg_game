import { describe, expect, it } from 'vitest';
import {
  getActiveEndMs,
  getActiveStartMs,
  getAttackBeams,
  getAttackDurationMs,
  getAttackPhase,
  getSweepCenterX,
  getTelegraphProgress,
  isAttackDamagingPlayer,
  isPlayerHitByBeams,
} from '../src/game/boss/attackRuntime';
import type { ArenaBounds, ScheduledAttack } from '../src/game/boss/types';

const bounds: ArenaBounds = { minX: 70, maxX: 1210 };

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
    expect(isAttackDamagingPlayer(aimed, 1400, bounds, 500, 22)).toBe(false);
    expect(isAttackDamagingPlayer(aimed, 1850, bounds, 500, 22)).toBe(true);
    expect(isAttackDamagingPlayer(aimed, 2100, bounds, 500, 22)).toBe(false);
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
    const warning = getAttackBeams(aimed, 1400, bounds);
    const live = getAttackBeams(aimed, 1850, bounds);
    expect(warning).toEqual(live);
  });
});

describe('sweep geometry', () => {
  it('travels edge to edge in the requested direction', () => {
    expect(getSweepCenterX(bounds, 'leftToRight', 0)).toBe(70);
    expect(getSweepCenterX(bounds, 'leftToRight', 1)).toBe(1210);
    expect(getSweepCenterX(bounds, 'rightToLeft', 0)).toBe(1210);
    expect(getSweepCenterX(bounds, 'rightToLeft', 1)).toBe(70);
    expect(getSweepCenterX(bounds, 'leftToRight', 0.5)).toBe(640);
  });

  it('parks the sweep at its starting edge while telegraphing', () => {
    const sweep: ScheduledAttack = {
      id: 1,
      type: 'sweepLaser',
      phaseIndex: 2,
      startMs: 0,
      timing: { telegraphMs: 1000, activeMs: 3800, recoveryMs: 400 },
      params: { type: 'sweepLaser', direction: 'leftToRight', halfWidth: 34, speed: 300 },
    };
    expect(getAttackBeams(sweep, 500, bounds)[0].centerX).toBe(70);
    expect(getAttackBeams(sweep, 1000, bounds)[0].centerX).toBe(70);
    expect(getAttackBeams(sweep, 4800, bounds)[0].centerX).toBe(1210);
  });
});
