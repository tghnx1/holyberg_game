import { describe, expect, it } from 'vitest';
import {
  GOOD_WINDOW_MS,
  OK_WINDOW_MS,
  PERFECT_WINDOW_MS,
  RHYTHM_SCORE_CAP,
} from '../src/game/rhythm/constants';
import { judgeTiming } from '../src/game/rhythm/JudgementSystem';
import {
  applyJudgement,
  calculateAccuracy,
  combineScores,
  getAwardedPoints,
  getMaximumRawScore,
  getMultiplier,
  initialScoreState,
} from '../src/game/rhythm/ScoreSystem';

describe('rhythm scoring logic', () => {
  it('judges early and late hits using absolute timing differences', () => {
    expect(judgeTiming(30)).toBe('PERFECT');
    expect(judgeTiming(-PERFECT_WINDOW_MS)).toBe('PERFECT');
    expect(judgeTiming(90)).toBe('GOOD');
    expect(judgeTiming(-GOOD_WINDOW_MS)).toBe('GOOD');
    expect(judgeTiming(150)).toBe('OK');
    expect(judgeTiming(OK_WINDOW_MS)).toBe('OK');
    expect(judgeTiming(220)).toBeNull();
  });

  it('uses the configured combo multiplier thresholds', () => {
    expect([0, 9, 10, 24, 25, 49, 50].map(getMultiplier)).toEqual([1, 1, 2, 2, 3, 3, 4]);
  });

  it.each([1, 20, 623])(
    'normalizes an all-PERFECT %i-note chart to the fixed score cap',
    (noteCount) => {
      let state = initialScoreState(noteCount);
      for (let note = 0; note < noteCount; note += 1) {
        state = applyJudgement(state, 'PERFECT');
      }
      expect(state.rawScore).toBe(getMaximumRawScore(noteCount));
      expect(state.score).toBe(RHYTHM_SCORE_CAP);
    },
  );

  it('normalizes positive judgements and never exceeds the cap', () => {
    const state = initialScoreState(1);
    expect(getAwardedPoints(state, 'PERFECT')).toBe(RHYTHM_SCORE_CAP);
    expect(getAwardedPoints(state, 'GOOD')).toBe(5250);
    expect(getAwardedPoints(state, 'OK')).toBe(3000);
    expect(applyJudgement(state, 'PERFECT').score).toBeLessThanOrEqual(RHYTHM_SCORE_CAP);
  });

  it('gives MISS zero points without subtracting score and resets multiplier', () => {
    let state = initialScoreState(20);
    for (let note = 0; note < 10; note += 1) state = applyJudgement(state, 'PERFECT');
    const earnedScore = state.score;
    expect(getMultiplier(state.combo)).toBe(2);
    expect(getAwardedPoints(state, 'MISS')).toBe(0);

    state = applyJudgement(state, 'MISS');
    expect(state.score).toBe(earnedScore);
    expect(state.combo).toBe(0);
    expect(getMultiplier(state.combo)).toBe(1);
  });

  it('calculates deterministic weighted accuracy and total score', () => {
    expect(calculateAccuracy({ ...initialScoreState(), perfect: 1, good: 1, ok: 1, miss: 1 })).toBeCloseTo(52.5);
    expect(combineScores(7430, RHYTHM_SCORE_CAP)).toBe(14_930);
  });
});
