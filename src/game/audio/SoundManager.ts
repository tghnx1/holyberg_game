type MuteListener = (muted: boolean) => void;
type VolumeListener = (volume: number) => void;

/** `sessionStorage`/`localStorage` doesn't exist in every environment this runs in — unit tests, some embeds. */
export const SOUND_MUTED_STORAGE_KEY = 'holyberg.sound.muted';
export const SOUND_VOLUME_STORAGE_KEY = 'holyberg.sound.musicVolume';
export const DEFAULT_AUDIO_VOLUME = 0.55;

/**
 * Where the mute preference is read from and written to. An interface, not a
 * direct `localStorage` reference, so tests can inject an in-memory stand-in
 * instead of touching real browser storage.
 */
export interface MuteStorage {
  /** `undefined` when nothing has been saved yet (as opposed to a saved `false`). */
  getMuted(): boolean | undefined;
  setMuted(muted: boolean): void;
}

export interface VolumeStorage {
  /** `undefined` when no valid volume has been saved yet. */
  getVolume(): number | undefined;
  setVolume(volume: number): void;
}

/**
 * `localStorage` can be unavailable or throw synchronously — Safari private
 * browsing, a locked-down embed, a full quota, or simply no `window` at all
 * (this module also loads under plain Node, e.g. in tests) — so every access
 * is guarded. Failing to read/write it must never break the game; it only
 * means the preference doesn't persist this session.
 *
 * Checked through `window` rather than the bare `localStorage` global: in a
 * plain Node environment `window` does not exist at all, which short-circuits
 * before ever touching `localStorage` — some Node builds expose a `localStorage`
 * global that warns on access, which a bare `typeof localStorage` check would
 * otherwise trigger for no reason in every test run.
 */
/**
 * Builds a `localStorage`-backed `MuteStorage` under `key`. Exported (rather
 * than hardwired to `SOUND_MUTED_STORAGE_KEY`) so another independent mute
 * switch — e.g. `SfxManager` — can reuse this exact mechanism with its own
 * key instead of duplicating it.
 */
export function createLocalStorageMuteStorage(key: string): MuteStorage {
  const storage = (): Storage | undefined => {
    try {
      return typeof window === 'undefined' ? undefined : window.localStorage;
    } catch {
      return undefined;
    }
  };
  return {
    getMuted(): boolean | undefined {
      try {
        const raw = storage()?.getItem(key);
        return raw === null || raw === undefined ? undefined : raw === 'true';
      } catch {
        return undefined;
      }
    },
    setMuted(muted: boolean): void {
      try {
        storage()?.setItem(key, String(muted));
      } catch {
        // Blocked/unavailable storage: nothing to do, muting still works for
        // the rest of this session, it just won't survive a reload.
      }
    },
  };
}

/** Same safe persistence contract as mute, kept separate so volume can be restored independently. */
export function createLocalStorageVolumeStorage(key: string): VolumeStorage {
  const storage = (): Storage | undefined => {
    try {
      return typeof window === 'undefined' ? undefined : window.localStorage;
    } catch {
      return undefined;
    }
  };
  return {
    getVolume(): number | undefined {
      try {
        const raw = storage()?.getItem(key);
        if (raw === null || raw === undefined) return undefined;
        const volume = Number(raw);
        return Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : undefined;
      } catch {
        return undefined;
      }
    },
    setVolume(volume: number): void {
      try {
        storage()?.setItem(key, String(volume));
      } catch {
        // Blocked/unavailable storage must not prevent an in-memory change.
      }
    },
  };
}

/**
 * Global, session-wide music settings. Anything that plays music (including
 * `AudioTrackPlayer`) subscribes and applies its own mute/volume, so this
 * module never touches Phaser's global sound manager and stays unit-testable.
 *
 * Mute and volume persist independently through `localStorage`: both restore
 * at construction, and every real change writes only its own value. Defaults
 * are music/SFX on at 55%.
 */
export class SoundManagerImpl {
  private muted: boolean;
  private volume: number;
  private readonly listeners = new Set<MuteListener>();
  private readonly volumeListeners = new Set<VolumeListener>();

  constructor(
    private readonly storage: MuteStorage = createLocalStorageMuteStorage(SOUND_MUTED_STORAGE_KEY),
    private readonly volumeStorage: VolumeStorage = createLocalStorageVolumeStorage(SOUND_VOLUME_STORAGE_KEY),
    defaultVolume = DEFAULT_AUDIO_VOLUME,
  ) {
    this.muted = this.readStoredMuted() ?? false;
    this.volume = this.readStoredVolume() ?? defaultVolume;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get currentVolume(): number {
    return this.volume;
  }

  // A misbehaving storage — the default factory already guards `localStorage`
  // itself, but any injected `MuteStorage` could still throw — must never
  // stop the mute switch from working in memory for the rest of the session.
  private readStoredMuted(): boolean | undefined {
    try {
      return this.storage.getMuted();
    } catch {
      return undefined;
    }
  }

  private writeStoredMuted(muted: boolean): void {
    try {
      this.storage.setMuted(muted);
    } catch {
      // Ignored — see readStoredMuted.
    }
  }

  private readStoredVolume(): number | undefined {
    try {
      return this.volumeStorage.getVolume();
    } catch {
      return undefined;
    }
  }

  private writeStoredVolume(volume: number): void {
    try {
      this.volumeStorage.setVolume(volume);
    } catch {
      // Ignored — see readStoredVolume.
    }
  }

  setMuted(muted: boolean): void {
    if (muted === this.muted) return;
    this.muted = muted;
    this.writeStoredMuted(muted);
    for (const listener of this.listeners) listener(muted);
  }

  toggle(): void {
    this.setMuted(!this.muted);
  }

  setVolume(volume: number): void {
    const next = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : this.volume));
    if (next === this.volume) return;
    this.volume = next;
    this.writeStoredVolume(next);
    for (const listener of this.volumeListeners) listener(next);
  }

  adjustVolume(delta: number): void {
    this.setVolume(this.volume + delta);
  }

  /** Returns an unsubscribe function. Fires immediately with the current state. */
  onChange(listener: MuteListener): () => void {
    this.listeners.add(listener);
    listener(this.muted);
    return () => this.listeners.delete(listener);
  }

  /** Returns an unsubscribe function. Fires immediately with the current volume. */
  onVolumeChange(listener: VolumeListener): () => void {
    this.volumeListeners.add(listener);
    listener(this.volume);
    return () => this.volumeListeners.delete(listener);
  }
}

export const SoundManager = new SoundManagerImpl();
