export class ProceduralBeat {
  private context?: AudioContext;
  private master?: GainNode;
  private nodes: AudioScheduledSourceNode[] = [];
  private originSeconds = 0;
  private running = false;

  constructor(private readonly bpm: number, private readonly durationMs: number) {}

  async unlock(): Promise<boolean> {
    try {
      this.context ??= new AudioContext();
      const resumed = await Promise.race([
        this.context.resume().then(() => true),
        new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 1200)),
      ]);
      if (!resumed) return false;
      if (this.context.state !== 'running') return false;
      return true;
    } catch {
      return false;
    }
  }

  start(): boolean {
    if (!this.context || this.context.state !== 'running') return false;
    this.master = this.context.createGain();
    this.master.gain.value = 0.16;
    this.master.connect(this.context.destination);
    this.originSeconds = this.context.currentTime + 0.04;
    this.running = true;
    this.scheduleBeat();
    return true;
  }

  get currentTimeMs(): number {
    if (!this.running || !this.context) return 0;
    return Math.max(0, (this.context.currentTime - this.originSeconds) * 1000);
  }

  stop(): void {
    this.running = false;
    for (const node of this.nodes) {
      try { node.stop(); } catch { /* already stopped */ }
      node.disconnect();
    }
    this.nodes = [];
    this.master?.disconnect();
    this.master = undefined;
  }

  async pause(): Promise<void> { if (this.context?.state === 'running') await this.context.suspend(); }
  async resume(): Promise<boolean> {
    try {
      if (this.running && this.context?.state === 'suspended') await this.context.resume();
      return !this.context || this.context.state === 'running';
    } catch { return false; }
  }

  private scheduleBeat(): void {
    if (!this.context || !this.master) return;
    const beatSeconds = 60 / this.bpm;
    const beats = Math.ceil(this.durationMs / 1000 / beatSeconds);
    for (let beat = 0; beat < beats; beat += 1) {
      const time = this.originSeconds + beat * beatSeconds;
      this.scheduleKick(time, beat % 4 === 0);
      this.scheduleHat(time + beatSeconds / 2);
    }
  }

  private scheduleKick(time: number, accent: boolean): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.frequency.setValueAtTime(accent ? 130 : 105, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.16);
    gain.gain.setValueAtTime(accent ? 1 : 0.72, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(time); oscillator.stop(time + 0.2);
    this.nodes.push(oscillator);
  }

  private scheduleHat(time: number): void {
    if (!this.context || !this.master) return;
    const length = Math.floor(this.context.sampleRate * 0.035);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const highpass = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    highpass.type = 'highpass'; highpass.frequency.value = 6500; gain.gain.value = 0.12;
    source.buffer = buffer; source.connect(highpass).connect(gain).connect(this.master);
    source.start(time); source.stop(time + 0.04);
    this.nodes.push(source);
  }
}
