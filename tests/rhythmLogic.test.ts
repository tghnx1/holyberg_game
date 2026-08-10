import { describe, expect, it } from 'vitest';
import { filterChartNotes, parseChart } from '../src/game/rhythm/ChartLoader';
import { EXCELLENT_WINDOW_MS, GOOD_WINDOW_MS, MISS_WINDOW_MS, PERFECT_WINDOW_MS } from '../src/game/rhythm/constants';
import { judgeTiming } from '../src/game/rhythm/JudgementSystem';
import { applyJudgement, calculateAccuracy, combineScores, getAwardedPoints, getMultiplier, initialScoreState } from '../src/game/rhythm/ScoreSystem';

describe('rhythm logic', () => {
  it('judges exact boundaries and ignores empty-lane timing', () => {
    expect(judgeTiming(PERFECT_WINDOW_MS)).toBe('PERFECT');
    expect(judgeTiming(EXCELLENT_WINDOW_MS)).toBe('EXCELLENT');
    expect(judgeTiming(-GOOD_WINDOW_MS)).toBe('GOOD');
    expect(judgeTiming(GOOD_WINDOW_MS + 1)).toBeNull();
    expect(judgeTiming(MISS_WINDOW_MS)).toBeNull();
  });
  it('uses combo multiplier thresholds', () => {
    expect([0, 9, 10, 24, 25, 49, 50].map(getMultiplier)).toEqual([1, 1, 2, 2, 3, 3, 4]);
  });
  it('awards every positive judgement with multiplier', () => {
    const state = initialScoreState();
    expect(getAwardedPoints(state, 'PERFECT')).toBe(150);
    expect(getAwardedPoints(state, 'EXCELLENT')).toBe(100);
    expect(getAwardedPoints(state, 'GOOD')).toBe(50);
    expect(getAwardedPoints({ ...state, combo: 9 }, 'PERFECT')).toBe(300);
  });
  it('resets combo after miss and never lowers energy below 20', () => {
    const state = applyJudgement({ ...initialScoreState(), combo: 20, energy: 21 }, 'MISS');
    expect(state.combo).toBe(0);
    expect(state.energy).toBe(20);
    expect(applyJudgement({ ...state, energy: 99 }, 'PERFECT').energy).toBe(100);
  });
  it('protects crowd energy during the beginner grace period', () => {
    const missed = applyJudgement({ ...initialScoreState(), combo: 4, energy: 80 }, 'MISS', true);
    expect(missed.combo).toBe(0);
    expect(missed.miss).toBe(1);
    expect(missed.energy).toBe(80);
  });
  it('calculates four-grade weighted accuracy and total score', () => {
    expect(calculateAccuracy({ ...initialScoreState(), perfect: 1, excellent: 1, good: 1, miss: 1 })).toBeCloseTo(57.5);
    expect(combineScores(500, 1200)).toBe(1700);
  });
  it('filters malformed and out-of-duration notes', () => {
    expect(filterChartNotes([{ timeMs: 200, action: 'holdFx' }, { timeMs: -1, action: 'tapLeft' }, { timeMs: 10, action: 'spin' }, null])).toEqual([{ timeMs: 200, action: 'holdFx' }]);
    expect(parseChart({ durationMs: 1000, notes: [{ timeMs: 1001, action: 'tapLeft' }, { timeMs: 999, action: 'tapRight' }] }).notes).toEqual([{ timeMs: 999, action: 'tapRight' }]);
  });
  it('keeps legacy lane charts compatible while exposing DJ actions', () => {
    expect(filterChartNotes([{ timeMs: 100, lane: 0 }, { timeMs: 200, lane: 3 }])).toEqual([
      { timeMs: 100, action: 'tapLeft' },
      { timeMs: 200, action: 'swipeRight' },
    ]);
  });
});
