import { describe, expect, it } from 'vitest';
import { AntiMashSystem, applyBadTap, LaneInputGuard } from '../src/game/rhythm/InputPenaltySystem';
import { applyJudgement, initialScoreState } from '../src/game/rhythm/ScoreSystem';

describe('bad taps and anti-mash', () => {
  it('allows one input per pointerdown and applies per-lane debounce', () => {
    const guard = new LaneInputGuard();
    expect(guard.beginPointer(1, 0, 100)).toBe(true);
    expect(guard.beginPointer(1, 1, 200)).toBe(false);
    guard.endPointer(1);
    expect(guard.beginPointer(1, 0, 150)).toBe(false);
    guard.endPointer(1);
    expect(guard.beginPointer(1, 0, 181)).toBe(true);
    expect(guard.beginPointer(2, 1, 181)).toBe(true);
  });
  it('penalizes an empty press without creating a miss', () => {
    const state = applyBadTap({ ...initialScoreState(), score: 30, combo: 12, energy: 20 });
    expect(state.score).toBe(0);
    expect(state.combo).toBe(0);
    expect(state.energy).toBe(19);
    expect(state.badTap).toBe(1);
    expect(state.miss).toBe(0);
  });
  it('activates lock on six bad taps in one second', () => {
    const antiMash = new AntiMashSystem();
    for (let index = 0; index < 5; index += 1) expect(antiMash.recordBadTap(index * 100)).toBe(false);
    expect(antiMash.recordBadTap(500)).toBe(true);
    expect(antiMash.isLocked(1000)).toBe(true);
    expect(antiMash.isLocked(1701)).toBe(false);
  });
  it('disables score and combo during lock, then supports normal scoring', () => {
    const initial = initialScoreState();
    const locked = applyJudgement(initial, 'PERFECT', false, false);
    expect(locked.score).toBe(0);
    expect(locked.combo).toBe(0);
    expect(locked.perfect).toBe(1);
    const restored = applyJudgement(locked, 'PERFECT');
    expect(restored.score).toBe(7500);
    expect(restored.combo).toBe(1);
  });
  it('tutorial state remains untouched unless a caller applies a bad tap', () => {
    expect(initialScoreState().badTap).toBe(0);
  });
});
