import {
  createLocalStorageMuteStorage,
  createLocalStorageVolumeStorage,
  SoundManagerImpl,
} from './SoundManager';

/** Independent from SOUND_MUTED_STORAGE_KEY, so the two switches persist separately. */
export const SFX_MUTED_STORAGE_KEY = 'holyberg.sound.sfxMuted';
export const SFX_VOLUME_STORAGE_KEY = 'holyberg.sound.sfxVolume';

/**
 * Independent mute switch for one-shot "system sounds" — jumps, pickups,
 * boss hits, UI stingers — everything in `gameAudioCatalog` marked
 * `kind: 'sfx'`. Deliberately the *same* class as the master `SoundManager`
 * (same persistence, same listener/onChange shape), just its own instance
 * and storage key, so turning system sounds off leaves music/ambience
 * playing and vice versa, without a second settings mechanism to maintain.
 *
 * `GameAudio.playSfx` is what actually honours this — it skips playback
 * outright when `SfxManager.isMuted`, rather than relying on Phaser's global
 * `sound.setMute`, which the master `SoundManager` already owns and which
 * would silence music too.
 */
export const SfxManager = new SoundManagerImpl(
  createLocalStorageMuteStorage(SFX_MUTED_STORAGE_KEY),
  createLocalStorageVolumeStorage(SFX_VOLUME_STORAGE_KEY),
);
