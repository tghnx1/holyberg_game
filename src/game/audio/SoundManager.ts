type MuteListener = (muted: boolean) => void;

/** `sessionStorage`/`localStorage` doesn't exist in every environment this runs in — unit tests, some embeds. */
export const SOUND_MUTED_STORAGE_KEY = 'holyberg.sound.muted';

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
function createLocalStorageMuteStorage(): MuteStorage {
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
        const raw = storage()?.getItem(SOUND_MUTED_STORAGE_KEY);
        return raw === null || raw === undefined ? undefined : raw === 'true';
      } catch {
        return undefined;
      }
    },
    setMuted(muted: boolean): void {
      try {
        storage()?.setItem(SOUND_MUTED_STORAGE_KEY, String(muted));
      } catch {
        // Blocked/unavailable storage: nothing to do, muting still works for
        // the rest of this session, it just won't survive a reload.
      }
    },
  };
}

/**
 * Global, session-wide mute switch. Anything that plays audio (currently
 * `AudioTrackPlayer`) subscribes with `onChange` and applies the mute itself;
 * this module holds no reference to any audio node so it stays usable from
 * plain unit tests.
 *
 * The preference persists across reloads through `MuteStorage` (`localStorage`
 * by default): restored once at construction, and every real change through
 * `setMuted` writes it back. Defaults to unmuted when nothing was saved yet.
 */
export class SoundManagerImpl {
  private muted: boolean;
  private readonly listeners = new Set<MuteListener>();

  constructor(private readonly storage: MuteStorage = createLocalStorageMuteStorage()) {
    this.muted = this.readStoredMuted() ?? false;
  }

  get isMuted(): boolean {
    return this.muted;
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

  setMuted(muted: boolean): void {
    if (muted === this.muted) return;
    this.muted = muted;
    this.writeStoredMuted(muted);
    for (const listener of this.listeners) listener(muted);
  }

  toggle(): void {
    this.setMuted(!this.muted);
  }

  /** Returns an unsubscribe function. Fires immediately with the current state. */
  onChange(listener: MuteListener): () => void {
    this.listeners.add(listener);
    listener(this.muted);
    return () => this.listeners.delete(listener);
  }
}

export const SoundManager = new SoundManagerImpl();
