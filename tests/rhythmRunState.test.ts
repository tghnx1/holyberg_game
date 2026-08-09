import { describe, expect, it, vi } from 'vitest';
import { resetRhythmRunState } from '../src/game/rhythm/RhythmRunState';

describe('RhythmScene replay state', () => {
  it('restores every per-run flag and tutorial reference', () => {
    const inputGuard = { reset: vi.fn() };
    const antiMash = { reset: vi.fn() };

    const state = resetRhythmRunState(inputGuard, antiMash);

    expect(state).toEqual({
      playing: false,
      starting: false,
      finished: false,
      lastBeat: -1,
      tutorialReady: false,
      tutorial: undefined,
      tutorialNote: undefined,
      tutorialPrompt: undefined,
    });
    expect(inputGuard.reset).toHaveBeenCalledOnce();
    expect(antiMash.reset).toHaveBeenCalledOnce();
  });

  it('returns a fresh clean state across repeated replays', () => {
    const inputGuard = { reset: vi.fn() };
    const antiMash = { reset: vi.fn() };

    for (let run = 0; run < 4; run += 1) {
      const state = resetRhythmRunState(inputGuard, antiMash);
      expect(state.finished).toBe(false);
      expect(state.playing).toBe(false);
      expect(state.lastBeat).toBe(-1);
    }

    expect(inputGuard.reset).toHaveBeenCalledTimes(4);
    expect(antiMash.reset).toHaveBeenCalledTimes(4);
  });
});
