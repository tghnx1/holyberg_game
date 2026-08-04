export interface TrackTimeSource {
  readonly currentTimeMs: number;
}

export class RhythmClock {
  private running = false;
  private paused = false;
  private pausedAt = 0;
  constructor(private readonly source: TrackTimeSource) {}
  start(): void { this.running = true; }
  get currentTimeMs(): number { return this.paused ? this.pausedAt : this.running ? this.source.currentTimeMs : 0; }
  pause(): void { this.pausedAt = this.currentTimeMs; this.paused = true; }
  resume(): void { this.paused = false; }
  stop(): void { this.running = false; }
}
