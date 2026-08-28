import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FullscreenExitReservedWidth } from '../src/game/responsive/FullscreenExitReservedWidth';

describe('FullscreenExitReservedWidth', () => {
  beforeEach(() => {
    FullscreenExitReservedWidth.set(0);
  });

  it('starts at zero and reflects the last published width', () => {
    expect(FullscreenExitReservedWidth.value).toBe(0);
    FullscreenExitReservedWidth.set(60);
    expect(FullscreenExitReservedWidth.value).toBe(60);
  });

  it('notifies subscribers only on an actual change, immediately with the current value', () => {
    const listener = vi.fn();
    const unsubscribe = FullscreenExitReservedWidth.onChange(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(0);

    FullscreenExitReservedWidth.set(0);
    expect(listener).toHaveBeenCalledTimes(1);

    FullscreenExitReservedWidth.set(64);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(64);

    // Leaving fullscreen drops it back to zero, notifying subscribers again.
    FullscreenExitReservedWidth.set(0);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    FullscreenExitReservedWidth.set(64);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
