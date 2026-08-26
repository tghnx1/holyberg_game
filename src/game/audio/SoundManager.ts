type MuteListener = (muted: boolean) => void;

/**
 * Global, session-wide mute switch. Anything that plays audio (currently
 * `AudioTrackPlayer`) subscribes with `onChange` and applies the mute itself;
 * this module holds no reference to any audio node so it stays usable from
 * plain unit tests.
 */
class SoundManagerImpl {
  private muted = false;
  private readonly listeners = new Set<MuteListener>();

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    if (muted === this.muted) return;
    this.muted = muted;
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
