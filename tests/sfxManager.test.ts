import { afterEach, describe, expect, it } from 'vitest';
import { SFX_MUTED_STORAGE_KEY, SFX_VOLUME_STORAGE_KEY, SfxManager } from '../src/game/audio/SfxManager';
import { SOUND_MUTED_STORAGE_KEY, SOUND_VOLUME_STORAGE_KEY, SoundManager } from '../src/game/audio/SoundManager';

describe('SfxManager', () => {
  afterEach(() => {
    // Session-wide singleton: reset between tests so cases don't leak state.
    SfxManager.setMuted(false);
  });

  it('starts unmuted and toggles, independently of SoundManager', () => {
    expect(SfxManager.isMuted).toBe(false);
    SfxManager.toggle();
    expect(SfxManager.isMuted).toBe(true);
    expect(SoundManager.isMuted).toBe(false);
    SfxManager.toggle();
    expect(SfxManager.isMuted).toBe(false);
  });

  it('uses its own storage key, distinct from the master SOUND switch', () => {
    expect(SFX_MUTED_STORAGE_KEY).not.toBe(SOUND_MUTED_STORAGE_KEY);
    expect(SFX_MUTED_STORAGE_KEY).toBe('holyberg.sound.sfxMuted');
    expect(SFX_VOLUME_STORAGE_KEY).toBe('holyberg.sound.sfxVolume');
    expect(SFX_VOLUME_STORAGE_KEY).not.toBe(SOUND_VOLUME_STORAGE_KEY);
  });
});
