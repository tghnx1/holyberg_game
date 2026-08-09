export interface TrackTimeSource {
  readonly currentTimeMs: number;
}

export class RhythmClock {
  private running = false;
  private paused = false;
  private pausedAt = 0;
  private useFallbackClock = false;
  private fallbackStartedAtMs = 0;
  constructor(private readonly source: TrackTimeSource) {}

  start(useFallbackClock = false): void {
    this.running = true;
    this.paused = false;
    this.useFallbackClock = useFallbackClock;
    this.fallbackStartedAtMs = this.nowMs();
  }

  get currentTimeMs(): number {
    if (this.paused) return this.pausedAt;
    if (!this.running) return 0;
    if (this.useFallbackClock) return Math.max(0, this.nowMs() - this.fallbackStartedAtMs);
    return this.source.currentTimeMs;
  }

  pause(): void { this.pausedAt = this.currentTimeMs; this.paused = true; }

  resume(): void {
    if (this.useFallbackClock) this.fallbackStartedAtMs = this.nowMs() - this.pausedAt;
    this.paused = false;
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    this.useFallbackClock = false;
    this.pausedAt = 0;
    this.fallbackStartedAtMs = 0;
  }

  private nowMs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
    return Date.now();
  }
}
