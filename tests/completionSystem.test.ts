import { describe, expect, it } from 'vitest';
import { CompletionGate, shouldCompleteTrack } from '../src/game/rhythm/CompletionSystem';

describe('track completion', () => {
  it('requires both audio completion and every note to be judged', () => {
    expect(shouldCompleteTrack(false, false)).toBe(false);
    expect(shouldCompleteTrack(true, false)).toBe(false);
    expect(shouldCompleteTrack(false, true)).toBe(false);
    expect(shouldCompleteTrack(true, true)).toBe(true);
  });

  it('executes the completion callback only once', () => {
    const gate = new CompletionGate();
    let calls = 0;
    expect(gate.tryComplete(true, () => { calls += 1; })).toBe(true);
    expect(gate.tryComplete(true, () => { calls += 1; })).toBe(false);
    expect(calls).toBe(1);
  });
});
