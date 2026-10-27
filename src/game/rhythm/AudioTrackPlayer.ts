import type { TrackTimeSource } from './RhythmClock';
import { DEFAULT_AUDIO_VOLUME } from '../audio/SoundManager';

const START_LEAD_SECONDS = 0.04;
const DEFAULT_FADE_OUT_SECONDS = 0.25;
const AUDIO_RESUME_TIMEOUT_MS = 750;

export class AudioTrackPlayer implements TrackTimeSource {
  private context?: AudioContext;
  private paused = false;
  private playbackAttempt = 0;
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
  private volume = DEFAULT_AUDIO_VOLUME;
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
    const context = this.context;
    const buffer = await context.decodeAudioData(encodedAudio);
    if (this.context !== context) return;
    this.buffer = buffer;
    if (!this.masterGain) {
      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);
      this.applyMasterVolume();
    }
  }

  /** Applies (or queues, if the context isn't ready yet) the global mute state. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMasterVolume();
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.applyMasterVolume();
  }

  private applyMasterVolume(): void {
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.volume;
  }

  async unlock(): Promise<boolean> {
    const context = this.context;
    if (!context || context.state === 'closed') return false;
    this.paused = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.resumeContext(context),
        new Promise<void>((resolve) => {
          timeout = globalThis.setTimeout(resolve, AUDIO_RESUME_TIMEOUT_MS);
        }),
      ]);
      const resumed = this.context === context && !this.paused && context.state === 'running';
      if (!resumed && this.context === context) this.paused = true;
      return resumed;
    } catch {
      if (this.context === context) this.paused = true;
      return false;
    } finally {
      if (timeout !== undefined) globalThis.clearTimeout(timeout);
    }
  }

  private async resumeContext(context: AudioContext): Promise<void> {
    await context.resume();
    // A timed-out resume may settle after another pause or after its retry UI appears.
    if (this.context === context && this.paused && context.state === 'running') {
      await context.suspend();
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
    startDelaySeconds = 0,
  ): Promise<boolean> {
    if (!this.context || !this.buffer || this.context.state === 'closed') return false;

    const context = this.context;
    const attempt = ++this.playbackAttempt;
    this.paused = false;
    let resumeAttempt: Promise<void>;
    try {
      // Scheduling in the gesture handler keeps iOS from dropping the audio
      // permission while resume() settles asynchronously.
      resumeAttempt = this.resumeContext(context);
      if (!this.schedulePlayback(startSeconds, endSeconds, fadeOutSeconds, startDelaySeconds)) {
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
    if (this.context !== context || attempt !== this.playbackAttempt) return false;
    if (context.state === 'running' || this.paused) return true;

    // A pending or rejected iOS resume must release the UI for another tap.
    this.paused = true;
    this.running = false;
    this.stopSource();
    return false;
  }

  private schedulePlayback(
    startSeconds: number,
    endSeconds: number,
    fadeOutSeconds: number,
    startDelaySeconds = 0,
  ): boolean {
    if (!this.context || !this.buffer) return false;
    if (
      !Number.isFinite(startSeconds) ||
      !Number.isFinite(endSeconds) ||
      !Number.isFinite(startDelaySeconds) ||
      startDelaySeconds < 0 ||
      endSeconds <= startSeconds
    ) return false;
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
    const startTime = this.context.currentTime + START_LEAD_SECONDS + startDelaySeconds;
    this.originSeconds = startTime - startOffsetSeconds;
    this.running = true;
    this.ended = false;
    this.stoppedIntentionally = false;
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
    this.paused = true;
    if (this.context?.state === 'running') await this.context.suspend();
  }

  async resume(): Promise<boolean> {
    return this.unlock();
  }

  stop(): void {
    this.playbackAttempt += 1;
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
    this.masterGain?.disconnect();
    this.masterGain = undefined;
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
