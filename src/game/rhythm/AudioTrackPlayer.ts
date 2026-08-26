import type { TrackTimeSource } from './RhythmClock';

const START_LEAD_SECONDS = 0.04;
const DEFAULT_FADE_OUT_SECONDS = 0.25;
const AUDIO_RESUME_TIMEOUT_MS = 750;

export class AudioTrackPlayer implements TrackTimeSource {
  private context?: AudioContext;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private gain?: GainNode;
  private originSeconds = 0;
  private playbackStartSeconds = 0;
  private playbackEndSeconds = 0;
  private running = false;
  private stoppedIntentionally = false;
  private ended = false;
  /** Session-wide mute; persists across `schedulePlayback` calls since it lives on this node, not the per-play gain. */
  private masterGain?: GainNode;
  private muted = false;
  onEnded?: () => void;

  /**
   * Decodes the track. Takes ownership of `encodedAudio`: `decodeAudioData`
   * detaches the buffer, so the caller must not read it again and should drop
   * its own reference (see RhythmScene, which clears the loader cache entry).
   *
   * Deliberately not copied first. A defensive `slice(0)` here duplicated
   * several megabytes of encoded audio purely so the detached original could
   * stay in Phaser's binary cache, where nothing ever read it again.
   */
  async prepare(encodedAudio: ArrayBuffer): Promise<void> {
    this.context ??= new AudioContext();
    this.buffer = await this.context.decodeAudioData(encodedAudio);
    if (!this.masterGain) {
      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);
      this.masterGain.gain.value = this.muted ? 0 : 1;
    }
  }

  /** Applies (or queues, if the context isn't ready yet) the global mute state. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : 1;
  }

  async unlock(): Promise<boolean> {
    try {
      if (!this.context) return false;
      await this.context.resume();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  start(startSeconds = 0, endSeconds = this.durationSeconds, fadeOutSeconds = DEFAULT_FADE_OUT_SECONDS): boolean {
    if (!this.context || !this.buffer || this.context.state !== 'running') return false;
    return this.schedulePlayback(startSeconds, endSeconds, fadeOutSeconds);
  }

  async startFromGesture(
    startSeconds = 0,
    endSeconds = this.durationSeconds,
    fadeOutSeconds = DEFAULT_FADE_OUT_SECONDS,
  ): Promise<boolean> {
    if (!this.context || !this.buffer || this.context.state === 'closed') return false;

    const context = this.context;
    let resumeAttempt: Promise<void>;
    try {
      // Scheduling in the gesture handler keeps iOS from dropping the audio
      // permission while resume() settles asynchronously.
      resumeAttempt = context.resume();
      if (!this.schedulePlayback(startSeconds, endSeconds, fadeOutSeconds)) {
        void resumeAttempt.catch(() => undefined);
        return false;
      }
    } catch {
      return false;
    }

    let resumeTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        resumeAttempt.catch(() => undefined),
        new Promise<void>((resolve) => {
          resumeTimeout = globalThis.setTimeout(resolve, AUDIO_RESUME_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (resumeTimeout !== undefined) globalThis.clearTimeout(resumeTimeout);
    }
    if (context.state === 'running') return true;

    // A pending or rejected iOS resume must release the UI for another tap.
    this.running = false;
    this.stopSource();
    return false;
  }

  private schedulePlayback(startSeconds: number, endSeconds: number, fadeOutSeconds: number): boolean {
    if (!this.context || !this.buffer) return false;
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) return false;
    this.stopSource();
    const startOffsetSeconds = Math.min(Math.max(0, startSeconds), this.buffer.duration);
    const stopOffsetSeconds = Math.min(Math.max(startOffsetSeconds, endSeconds), this.buffer.duration);
    const playbackDurationSeconds = stopOffsetSeconds - startOffsetSeconds;
    const actualFadeOutSeconds = Math.min(Math.max(0, fadeOutSeconds), playbackDurationSeconds / 2);
    this.gain = this.context.createGain();
    this.gain.connect(this.masterGain ?? this.context.destination);
    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.gain);
    this.playbackStartSeconds = startOffsetSeconds;
    this.playbackEndSeconds = stopOffsetSeconds;
    this.originSeconds = this.context.currentTime + START_LEAD_SECONDS - startOffsetSeconds;
    this.running = true;
    this.ended = false;
    this.stoppedIntentionally = false;
    const startTime = this.context.currentTime + START_LEAD_SECONDS;
    const stopTime = startTime + playbackDurationSeconds;
    this.gain.gain.setValueAtTime(1, startTime);
    if (actualFadeOutSeconds > 0) {
      const fadeStart = Math.max(startTime, stopTime - actualFadeOutSeconds);
      this.gain.gain.setValueAtTime(1, fadeStart);
      this.gain.gain.linearRampToValueAtTime(0, stopTime);
    }
    this.source.onended = () => {
      if (this.stoppedIntentionally) return;
      this.running = false;
      this.ended = true;
      this.onEnded?.();
    };
    this.source.start(startTime, startOffsetSeconds);
    this.source.stop(stopTime);
    return true;
  }

  get currentTimeSeconds(): number {
    if (!this.context || !this.buffer) return 0;
    if (this.ended) return this.playbackEndSeconds || this.buffer.duration;
    if (!this.running) return this.playbackStartSeconds;
    return Math.min(this.playbackEndSeconds || this.buffer.duration, Math.max(this.playbackStartSeconds, this.context.currentTime - this.originSeconds));
  }

  get durationSeconds(): number {
    return this.buffer?.duration ?? 0;
  }

  get hasEnded(): boolean {
    return this.ended;
  }

  async pause(): Promise<void> {
    if (this.context?.state === 'running') await this.context.suspend();
  }

  async resume(): Promise<boolean> {
    return this.unlock();
  }

  stop(): void {
    this.stoppedIntentionally = true;
    this.running = false;
    this.stopSource();
    this.ended = true;
  }

  destroy(): void {
    this.stop();
    this.gain?.disconnect();
    this.gain = undefined;
    this.buffer = undefined;
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.context = undefined;
  }

  private stopSource(): void {
    if (!this.source) return;
    this.source.onended = null;
    try {
      this.source.stop();
    } catch {
      // The source may already have naturally ended.
    }
    this.source.disconnect();
    this.source = undefined;
  }
}
