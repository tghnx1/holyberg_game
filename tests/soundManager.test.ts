import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundManager } from '../src/game/audio/SoundManager';

describe('SoundManager', () => {
  beforeEach(() => {
    // Session-wide singleton: reset between tests so cases don't leak state.
    SoundManager.setMuted(false);
  });

  it('starts unmuted and toggles', () => {
    expect(SoundManager.isMuted).toBe(false);
    SoundManager.toggle();
    expect(SoundManager.isMuted).toBe(true);
    SoundManager.toggle();
    expect(SoundManager.isMuted).toBe(false);
  });

  it('notifies subscribers only on an actual change', () => {
    const listener = vi.fn();
    const unsubscribe = SoundManager.onChange(listener);
    // onChange fires immediately with the current state.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(false);

    SoundManager.setMuted(false);
    expect(listener).toHaveBeenCalledTimes(1);

    SoundManager.setMuted(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(true);

    unsubscribe();
    SoundManager.setMuted(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
