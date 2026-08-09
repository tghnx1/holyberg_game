import { afterEach, describe, expect, it, vi } from 'vitest';
import { RhythmClock } from '../src/game/rhythm/RhythmClock';

describe('RhythmClock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks audio time when the source is available', () => {
    const source = { currentTimeMs: 0 };
    const clock = new RhythmClock(source);

    clock.start();
    expect(clock.currentTimeMs).toBe(0);

    source.currentTimeMs = 1234;
    expect(clock.currentTimeMs).toBe(1234);
  });

  it('falls back to a monotonic clock when audio is unavailable', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const source = { currentTimeMs: 0 };
    const clock = new RhythmClock(source);

    clock.start(true);
    expect(clock.currentTimeMs).toBe(0);

    now = 1480;
    expect(clock.currentTimeMs).toBe(480);

    clock.pause();
    now = 2000;
    expect(clock.currentTimeMs).toBe(480);

    clock.resume();
    now = 2300;
    expect(clock.currentTimeMs).toBe(780);
  });
});
