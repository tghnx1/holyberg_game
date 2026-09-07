import { describe, expect, it } from 'vitest';
import { getActiveEndMs, getActiveStartMs, getAttackDurationMs } from '../src/game/boss/attackRuntime';
import {
  ATTACK_SHAPES,
  ATTACK_TIMINGS,
  BOSS_FIGHT_DURATION_MS,
  BOSS_FULL_FIGHT_DURATION_MS,
  BOSS_PHASES,
  BOSS_PLAYER,
  MINIMUM_TELEGRAPH_MS,
} from '../src/game/boss/bossConfig';
import type { BossAttackType } from '../src/game/boss/types';
import {
  buildFightPlan,
  buildLaserWall,
  createRandom,
  getPhaseAt,
} from '../src/game/boss/fightSequence';
import type { ArenaBounds } from '../src/game/boss/types';

const bounds: ArenaBounds = { minX: 70, maxX: 1210 };

/** The tail is cut, so early attacks retain their authored pacing. */
describe('fight length', () => {
  const FULL_AUTHORED_DURATION_MS = 60_200;

  it('runs for the first half of the authored fight', () => {
    expect(BOSS_FULL_FIGHT_DURATION_MS).toBe(FULL_AUTHORED_DURATION_MS);
    expect(BOSS_FIGHT_DURATION_MS).toBe(30_100);
  });

  it('keeps the authored phase pacing unchanged', () => {
    expect(BOSS_PHASES.map((phase) => phase.durationMs)).toEqual([15_400, 16_800, 18_200, 9_800]);
  });

  it('shortens the fight by running fewer attacks, never faster ones', () => {
    // The reaction window is the thing a player feels. None of it was spent
    // buying the 30%: base timings, per-phase telegraph scales and the floor
    // are all untouched.
    expect(ATTACK_TIMINGS.aimedLaser.telegraphMs).toBe(820);
    expect(ATTACK_TIMINGS.laserWall.telegraphMs).toBe(950);
    expect(MINIMUM_TELEGRAPH_MS).toBe(520);
    expect(BOSS_PHASES.map((phase) => phase.telegraphScale)).toEqual([1.35, 1.1, 0.95, 0.85]);
    expect(BOSS_PHASES.map((phase) => phase.gapMs)).toEqual([900, 620, 480, 360]);
  });

  it('schedules only the authored prefix before the cutoff', () => {
    const byPhase = new Map<number, number>();
    for (const attack of buildFightPlan(bounds, 1).attacks) {
      byPhase.set(attack.phaseIndex, (byPhase.get(attack.phaseIndex) ?? 0) + 1);
      expect(attack.startMs).toBeLessThan(BOSS_FIGHT_DURATION_MS);
    }
    expect([...byPhase.keys()].sort()).toEqual([0, 1]);
  });

  it('preserves every pre-cutoff attack exactly as authored', () => {
    const shortened = buildFightPlan(bounds, 17);
    const full = buildFightPlan(bounds, 17, BOSS_PHASES, BOSS_FULL_FIGHT_DURATION_MS);
    expect(shortened.attacks).toEqual(
      full.attacks.filter((attack) => attack.startMs < BOSS_FIGHT_DURATION_MS),
    );
  });
});

describe('fight plan', () => {
  it('is deterministic for a given seed', () => {
    expect(buildFightPlan(bounds, 7)).toEqual(buildFightPlan(bounds, 7));
    expect(buildFightPlan(bounds, 7)).not.toEqual(buildFightPlan(bounds, 8));
  });

  it('only ever schedules aimed lasers and laser walls', () => {
    const allowed: BossAttackType[] = ['aimedLaser', 'laserWall'];
    for (let seed = 1; seed <= 20; seed += 1) {
      for (const attack of buildFightPlan(bounds, seed).attacks) {
        expect(allowed).toContain(attack.type);
      }
    }
    for (const phase of BOSS_PHASES) {
      for (const type of phase.pattern) expect(allowed).toContain(type);
    }
  });

  it('reports the shortened playable duration while allowing the final live attack to resolve', () => {
    const plan = buildFightPlan(bounds, 3);
    expect(plan.attacks.length).toBeGreaterThan(1);
    const phasesUsed = new Set(plan.attacks.map((attack) => attack.phaseIndex));
    expect([...phasesUsed].sort()).toEqual([0, 1]);
    expect(plan.totalDurationMs).toBe(BOSS_FIGHT_DURATION_MS);
    const finalAttack = plan.attacks.at(-1)!;
    expect(finalAttack.startMs).toBeLessThan(BOSS_FIGHT_DURATION_MS);
    expect(finalAttack.startMs + getAttackDurationMs(finalAttack)).toBeGreaterThan(BOSS_FIGHT_DURATION_MS);
  });

  it('never overlaps two damage windows, so no combination is unavoidable', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const { attacks } = buildFightPlan(bounds, seed);
      for (let index = 1; index < attacks.length; index += 1) {
        const previous = attacks[index - 1];
        const current = attacks[index];
        // The next telegraph may only begin after the previous attack is done.
        expect(current.startMs).toBeGreaterThanOrEqual(
          previous.startMs + getAttackDurationMs(previous),
        );
        expect(getActiveStartMs(current)).toBeGreaterThan(getActiveEndMs(previous));
      }
    }
  });

  it('always gives a telegraph long enough to react to', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      for (const attack of buildFightPlan(bounds, seed).attacks) {
        expect(attack.timing.telegraphMs).toBeGreaterThanOrEqual(MINIMUM_TELEGRAPH_MS);
      }
    }
  });

  it('escalates: later phases telegraph no longer than earlier ones', () => {
    const scales = BOSS_PHASES.map((phase) => phase.telegraphScale);
    expect([...scales].sort((a, b) => b - a)).toEqual(scales);
    const gaps = BOSS_PHASES.map((phase) => phase.gapMs);
    expect([...gaps].sort((a, b) => b - a)).toEqual(gaps);
  });
});

describe('laser wall fairness', () => {
  it('always leaves exactly one readable gap that no column covers', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const wall = buildLaserWall(bounds, createRandom(seed));
      expect(wall.columnCenters).toHaveLength(ATTACK_SHAPES.laserWall.columnCount);
      expect(wall.safeGapHalfWidth).toBeGreaterThan(BOSS_PLAYER.hitHalfWidth);

      // The gap is inside the arena.
      expect(wall.safeGapCenterX - wall.safeGapHalfWidth).toBeGreaterThanOrEqual(bounds.minX);
      expect(wall.safeGapCenterX + wall.safeGapHalfWidth).toBeLessThanOrEqual(bounds.maxX);

      // Standing dead centre in the gap touches no column.
      for (const centerX of wall.columnCenters) {
        const separation = Math.abs(centerX - wall.safeGapCenterX);
        expect(separation).toBeGreaterThan(wall.halfWidth + BOSS_PLAYER.hitHalfWidth);
      }
    }
  });
});

describe('phase lookup', () => {
  it('reports the phase running at a given fight time', () => {
    expect(getPhaseAt(0).index).toBe(0);
    expect(getPhaseAt(BOSS_PHASES[0].durationMs - 1).index).toBe(0);
    expect(getPhaseAt(BOSS_PHASES[0].durationMs).index).toBe(1);
    expect(getPhaseAt(BOSS_FULL_FIGHT_DURATION_MS + 10_000).index).toBe(BOSS_PHASES.length - 1);
  });
});
