import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioTrackPlayer } from '../src/game/rhythm/AudioTrackPlayer';

class FakeAudioContext {
  static latest?: FakeAudioContext;

  state: AudioContextState = 'suspended';
  currentTime = 12;
  destination = {} as AudioDestinationNode;
  readonly resume = vi.fn(async () => {
    this.state = 'running';
  });
  readonly source = {
    buffer: null as AudioBuffer | null,
    onended: null as (() => void) | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  readonly gain = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  constructor() {
    FakeAudioContext.latest = this;
  }

  decodeAudioData = vi.fn(async () => ({ duration: 90 }) as AudioBuffer);
  createBufferSource = vi.fn(() => this.source as unknown as AudioBufferSourceNode);
  createGain = vi.fn(() => this.gain as unknown as GainNode);
  close = vi.fn(async () => {
    this.state = 'closed';
  });
}

describe('AudioTrackPlayer mobile start', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeAudioContext.latest = undefined;
  });

  it('schedules playback inside the gesture while the audio context resumes', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const player = new AudioTrackPlayer();
    await player.prepare(new ArrayBuffer(8));
    const context = FakeAudioContext.latest!;

    const startAttempt = player.startFromGesture(25, 40, 0.25);

    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.source.start).toHaveBeenCalledWith(12.04, 25);
    expect(await startAttempt).toBe(true);
    expect(player.currentTimeSeconds).toBe(25);
  });
});
