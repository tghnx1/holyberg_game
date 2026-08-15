import { describe, expect, it } from 'vitest';
import { RhythmClock } from '../src/game/rhythm/RhythmClock';

describe('RhythmClock', () => {
  it('reads the authoritative audio source in seconds and milliseconds', () => {
    const source = { currentTimeSeconds: 0 };
    const clock = new RhythmClock(source);
    clock.start();
    source.currentTimeSeconds = 1.234;
    expect(clock.currentTimeSeconds).toBe(1.234);
    expect(clock.currentTimeMs).toBe(1234);
  });

  it('freezes its exposed value while paused', () => {
    const source = { currentTimeSeconds: 0.48 };
    const clock = new RhythmClock(source);
    clock.start();
    clock.pause();
    source.currentTimeSeconds = 2;
    expect(clock.currentTimeMs).toBe(480);
    clock.resume();
    expect(clock.currentTimeSeconds).toBe(2);
  });
});
