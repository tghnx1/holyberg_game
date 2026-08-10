import { describe, expect, it } from 'vitest';
import { END_GRACE_MS } from '../src/game/rhythm/constants';
import { CompletionGate, getChartEndTimeMs, shouldCompleteChart } from '../src/game/rhythm/CompletionSystem';

describe('chart completion', () => {
  it('completes after duration when every note is hit', () => {
    const end = getChartEndTimeMs(35000, [{ timeMs: 31000, action: 'tapLeft' }]);
    expect(shouldCompleteChart(end + END_GRACE_MS, end)).toBe(true);
  });
  it('allows the final note to become overdue when every note is missed', () => {
    const end = getChartEndTimeMs(1000, [{ timeMs: 1200, action: 'tapLeft' }]);
    expect(end).toBe(1500);
    expect(shouldCompleteChart(end + END_GRACE_MS - 1, end)).toBe(false);
    expect(shouldCompleteChart(end + END_GRACE_MS, end)).toBe(true);
  });
  it('executes completion callback only once', () => {
    const gate = new CompletionGate();
    let calls = 0;
    expect(gate.tryComplete(true, () => { calls += 1; })).toBe(true);
    expect(gate.tryComplete(true, () => { calls += 1; })).toBe(false);
    expect(calls).toBe(1);
  });
});
