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
    const state = applyBadTap({ ...initialScoreState(), score: 30, combo: 12 });
    expect(state.score).toBe(0);
    expect(state.combo).toBe(0);
    expect(state.badTap).toBe(1);
    expect(state.miss).toBe(0);
  });

  /**
   * A bad tap used to add to an unbounded running debt that was subtracted
   * from the normalized score on every award. Enough of them (188, against
   * the 7500 cap) put the debt beyond anything the rest of the track could
   * pay back, so the score stayed pinned at 0 for the whole run and a
   * subsequent replay felt like nothing counted either. Berlin and the boss
   * fight never had this: both deduct from the current score and floor at 0.
   */
  describe('a bad tap can never create unrecoverable debt', () => {
    const chart = (notes: number) => initialScoreState(notes);

    it('deducts nothing from a player who has not earned anything yet', () => {
      let state = chart(400);
      for (let index = 0; index < 300; index += 1) state = applyBadTap(state);
      expect(state.score).toBe(0);
      expect(state.scorePenalty).toBe(0);
      expect(state.badTap).toBe(300);
    });

    it('still scores a full clear after a mashing spree', () => {
      let state = chart(400);
      for (let index = 0; index < 300; index += 1) state = applyBadTap(state);
      for (let index = 0; index < 400; index += 1) state = applyJudgement(state, 'PERFECT');
      expect(state.score).toBe(7500);
    });

    it('never takes more than the player has actually earned', () => {
      let state = chart(400);
      for (let index = 0; index < 200; index += 1) state = applyJudgement(state, 'PERFECT');
      const earned = state.score;
      expect(earned).toBeGreaterThan(0);
      for (let index = 0; index < 300; index += 1) state = applyBadTap(state);
      expect(state.score).toBe(0);
      expect(state.scorePenalty).toBeLessThanOrEqual(earned);
    });

    it('starts adding points again on the very next hit', () => {
      let state = chart(400);
      for (let index = 0; index < 200; index += 1) state = applyJudgement(state, 'PERFECT');
      for (let index = 0; index < 300; index += 1) state = applyBadTap(state);
      expect(state.score).toBe(0);
      const recovering = applyJudgement(state, 'PERFECT');
      expect(recovering.score).toBeGreaterThan(0);
    });

    it('costs the full penalty while the player can afford it', () => {
      let state = chart(400);
      for (let index = 0; index < 50; index += 1) state = applyJudgement(state, 'PERFECT');
      const before = state.score;
      const after = applyBadTap(state);
      expect(before - after.score).toBe(40);
    });
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
    const locked = applyJudgement(initial, 'PERFECT', false);
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
