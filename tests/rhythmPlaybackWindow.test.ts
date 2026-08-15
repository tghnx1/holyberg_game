import { describe, expect, it } from 'vitest';
import { getRhythmPlaybackProgress, resolveRhythmPlaybackWindow, selectRhythmNotesInWindow } from '../src/game/rhythm/RhythmPlaybackWindow';

describe('rhythm playback window', () => {
  it('defaults to the full audio range when the metadata omits window bounds', () => {
    const window = resolveRhythmPlaybackWindow({}, 13);

    expect(window).toEqual({
      startSeconds: 0,
      endSeconds: 13,
      durationSeconds: 13,
      fadeOutSeconds: 0.25,
    });
  });

  it('uses explicit start and end bounds from metadata', () => {
    const window = resolveRhythmPlaybackWindow({ startSeconds: 5, endSeconds: 17 }, 20);

    expect(window).toEqual({
      startSeconds: 5,
      endSeconds: 17,
      durationSeconds: 12,
      fadeOutSeconds: 0.25,
    });
  });

  it('filters notes to the selected range without altering their times', () => {
    const notes = [
      { time: 4.9, lane: 0, duration: 0, velocity: 1 },
      { time: 5, lane: 1, duration: 0, velocity: 1 },
      { time: 8.5, lane: 2, duration: 0, velocity: 1 },
      { time: 9, lane: 3, duration: 0, velocity: 1 },
    ] as const;

    expect(selectRhythmNotesInWindow(notes, 5, 9)).toEqual([
      { time: 5, lane: 1, duration: 0, velocity: 1 },
      { time: 8.5, lane: 2, duration: 0, velocity: 1 },
    ]);
  });

  it('maps absolute track time to playback progress inside the selected window', () => {
    expect(getRhythmPlaybackProgress(10, 8, 18)).toBeCloseTo(0.2);
    expect(getRhythmPlaybackProgress(8, 8, 18)).toBe(0);
    expect(getRhythmPlaybackProgress(20, 8, 18)).toBe(1);
  });
});
