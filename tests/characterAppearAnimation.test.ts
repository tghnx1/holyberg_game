import { describe, expect, it } from 'vitest';
import { stepAppearFrames } from '../src/game/dialogue/characterAppearAnimation';
import type { CharacterAssetRef } from '../src/game/characters/characterManifest';

const frame = (key: string, footGap = 0): CharacterAssetRef => ({ key, footGap } as CharacterAssetRef);

/** Runs every scheduled step synchronously, in order, like a fake clock. */
function runSynchronously(): (delayMs: number, callback: () => void) => void {
  const queue: (() => void)[] = [];
  const schedule = (_delayMs: number, callback: () => void) => {
    queue.push(callback);
  };
  // Drains as callbacks push more onto the queue (each frame schedules the next).
  const drain = () => {
    while (queue.length > 0) queue.shift()!();
  };
  return Object.assign(schedule, { drain }) as typeof schedule & { drain: () => void };
}

describe('stepAppearFrames', () => {
  it('shows every frame in order, then settles on settledFrame before completing', () => {
    const shown: string[] = [];
    let completed = false;
    const schedule = runSynchronously();

    stepAppearFrames({
      frames: [frame('appear-1'), frame('appear-2'), frame('appear-3')],
      settledFrame: frame('idle'),
      frameDurationMs: 90,
      onShowFrame: (f) => shown.push(f.key),
      schedule,
      onComplete: () => {
        completed = true;
      },
    });
    (schedule as unknown as { drain: () => void }).drain();

    expect(shown).toEqual(['appear-1', 'appear-2', 'appear-3', 'idle']);
    expect(completed).toBe(true);
  });

  it('never calls onComplete before the settled frame has been shown', () => {
    const order: string[] = [];
    const schedule = runSynchronously();

    stepAppearFrames({
      frames: [frame('appear-1')],
      settledFrame: frame('idle'),
      frameDurationMs: 90,
      onShowFrame: (f) => order.push(`frame:${f.key}`),
      schedule,
      onComplete: () => order.push('complete'),
    });
    (schedule as unknown as { drain: () => void }).drain();

    expect(order).toEqual(['frame:appear-1', 'frame:idle', 'complete']);
  });

  it('paces one schedule() call per frame, matching the documented ~90ms cadence', () => {
    const delays: number[] = [];
    stepAppearFrames({
      frames: [frame('a'), frame('b')],
      settledFrame: frame('idle'),
      frameDurationMs: 90,
      onShowFrame: () => undefined,
      schedule: (delayMs, callback) => {
        delays.push(delayMs);
        callback();
      },
      onComplete: () => undefined,
    });
    expect(delays).toEqual([90, 90]);
  });

  it('settles immediately with no scheduling when there are no appear frames', () => {
    const shown: string[] = [];
    let scheduled = false;
    let completed = false;
    stepAppearFrames({
      frames: [],
      settledFrame: frame('idle'),
      frameDurationMs: 90,
      onShowFrame: (f) => shown.push(f.key),
      schedule: () => {
        scheduled = true;
      },
      onComplete: () => {
        completed = true;
      },
    });
    expect(shown).toEqual(['idle']);
    expect(scheduled).toBe(false);
    expect(completed).toBe(true);
  });
});
