import type { TrackTimeSource } from './RhythmClock';

const START_LEAD_SECONDS = 0.04;

export class AudioTrackPlayer implements TrackTimeSource {
  private context?: AudioContext;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private gain?: GainNode;
  private originSeconds = 0;
  private running = false;
  private stoppedIntentionally = false;
  private ended = false;
  onEnded?: () => void;

  async prepare(encodedAudio: ArrayBuffer): Promise<void> {
    this.context ??= new AudioContext();
    this.buffer = await this.context.decodeAudioData(encodedAudio.slice(0));
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

  start(): boolean {
    if (!this.context || !this.buffer || this.context.state !== 'running') return false;
    this.stopSource();
    this.gain = this.context.createGain();
    this.gain.connect(this.context.destination);
    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.gain);
    this.originSeconds = this.context.currentTime + START_LEAD_SECONDS;
    this.running = true;
    this.ended = false;
    this.stoppedIntentionally = false;
    this.source.onended = () => {
      if (this.stoppedIntentionally) return;
      this.running = false;
      this.ended = true;
      this.onEnded?.();
    };
    this.source.start(this.originSeconds);
    return true;
  }

  get currentTimeSeconds(): number {
    if (!this.context || !this.buffer) return 0;
    if (this.ended) return this.buffer.duration;
    if (!this.running) return 0;
    return Math.min(this.buffer.duration, Math.max(0, this.context.currentTime - this.originSeconds));
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
