export interface TrackTimeSource {
  readonly currentTimeSeconds: number;
}

export class RhythmClock {
  private running = false;
  private paused = false;
  private pausedAt = 0;
  constructor(private readonly source: TrackTimeSource) {}

  start(): void {
    this.running = true;
    this.paused = false;
  }

  get currentTimeSeconds(): number {
    return this.currentTimeMs / 1000;
  }

  get currentTimeMs(): number {
    if (this.paused) return this.pausedAt;
    if (!this.running) return 0;
    return this.source.currentTimeSeconds * 1000;
  }

  pause(): void { this.pausedAt = this.currentTimeMs; this.paused = true; }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    this.pausedAt = 0;
  }
}
