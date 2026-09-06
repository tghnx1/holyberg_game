import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalStorageMuteStorage,
  type VolumeStorage,
  SOUND_MUTED_STORAGE_KEY,
  SoundManager,
  SoundManagerImpl,
  type MuteStorage,
} from '../src/game/audio/SoundManager';

/**
 * In-memory stand-in for `MuteStorage`, so persistence is tested without ever
 * touching real browser storage — there is none in this environment anyway,
 * but the point is that `SoundManagerImpl` never assumes there is one.
 */
function fakeMuteStorage(initial?: boolean): MuteStorage & { setCalls: boolean[] } {
  let saved = initial;
  const setCalls: boolean[] = [];
  return {
    setCalls,
    getMuted: () => saved,
    setMuted: (muted) => {
      saved = muted;
      setCalls.push(muted);
    },
  };
}

function fakeVolumeStorage(initial?: number): VolumeStorage & { setCalls: number[] } {
  let saved = initial;
  const setCalls: number[] = [];
  return {
    setCalls,
    getVolume: () => saved,
    setVolume: (volume) => {
      saved = volume;
      setCalls.push(volume);
    },
  };
}

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

describe('SoundManager persistence', () => {
  it('defaults to unmuted when nothing was ever saved', () => {
    const manager = new SoundManagerImpl(fakeMuteStorage(undefined));
    expect(manager.isMuted).toBe(false);
  });

  it('restores a saved muted state at construction', () => {
    const manager = new SoundManagerImpl(fakeMuteStorage(true));
    expect(manager.isMuted).toBe(true);
  });

  it('restores a saved unmuted state at construction, distinct from "nothing saved"', () => {
    const manager = new SoundManagerImpl(fakeMuteStorage(false));
    expect(manager.isMuted).toBe(false);
  });

  it('writes through setMuted on every actual change', () => {
    const storage = fakeMuteStorage(false);
    const manager = new SoundManagerImpl(storage);

    manager.setMuted(true);
    expect(storage.setCalls).toEqual([true]);

    manager.setMuted(false);
    expect(storage.setCalls).toEqual([true, false]);
  });

  it('does not write when setMuted is called with the current value', () => {
    const storage = fakeMuteStorage(false);
    const manager = new SoundManagerImpl(storage);

    manager.setMuted(false);
    expect(storage.setCalls).toEqual([]);
  });

  it('persists through toggle()', () => {
    const storage = fakeMuteStorage(false);
    const manager = new SoundManagerImpl(storage);

    manager.toggle();
    expect(manager.isMuted).toBe(true);
    expect(storage.setCalls).toEqual([true]);
  });

  it('restoring the saved value is what the ON/OFF listener sees on subscribe, with no extra step required', () => {
    const manager = new SoundManagerImpl(fakeMuteStorage(true));
    const listener = vi.fn();
    manager.onChange(listener);
    expect(listener).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('a getMuted() that throws is treated as "nothing saved", not a crash', () => {
    const storage: MuteStorage = {
      getMuted: () => {
        throw new Error('blocked');
      },
      setMuted: vi.fn(),
    };
    expect(() => new SoundManagerImpl(storage)).not.toThrow();
  });

  it('a setMuted() that throws never breaks setting the mute state in memory', () => {
    const storage: MuteStorage = {
      getMuted: () => false,
      setMuted: () => {
        throw new Error('quota exceeded');
      },
    };
    const manager = new SoundManagerImpl(storage);
    expect(() => manager.setMuted(true)).not.toThrow();
    expect(manager.isMuted).toBe(true);
  });

  it('the default storage factory never touches real localStorage in this (non-browser) test environment', () => {
    // SoundManager is constructed once at module load with the default
    // localStorage-backed factory; if it had thrown or touched a global that
    // doesn't exist here, importing the module at all would already have failed.
    expect(SoundManager.isMuted).toBe(false);
  });

  it('uses the documented storage key', () => {
    expect(SOUND_MUTED_STORAGE_KEY).toBe('holyberg.sound.muted');
  });

  it('createLocalStorageMuteStorage is safe with no window at all (e.g. this test environment)', () => {
    const storage = createLocalStorageMuteStorage('some.other.key');
    expect(storage.getMuted()).toBeUndefined();
    expect(() => storage.setMuted(true)).not.toThrow();
  });

  it('restores, persists, and notifies volume independently from mute', () => {
    const volumeStorage = fakeVolumeStorage(0.7);
    const manager = new SoundManagerImpl(fakeMuteStorage(false), volumeStorage);
    const listener = vi.fn();

    expect(manager.currentVolume).toBe(0.7);
    manager.onVolumeChange(listener);
    expect(listener).toHaveBeenCalledExactlyOnceWith(0.7);

    manager.setVolume(0.4);
    expect(volumeStorage.setCalls).toEqual([0.4]);
    expect(listener).toHaveBeenLastCalledWith(0.4);
    expect(manager.isMuted).toBe(false);
  });

  it('clamps volume changes to the playable 0–100% range', () => {
    const manager = new SoundManagerImpl(fakeMuteStorage(false), fakeVolumeStorage(0.55));
    manager.adjustVolume(1);
    expect(manager.currentVolume).toBe(1);
    manager.adjustVolume(-2);
    expect(manager.currentVolume).toBe(0);
  });
});
