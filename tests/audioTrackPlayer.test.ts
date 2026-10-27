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
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
}

describe('AudioTrackPlayer mobile start', () => {
  afterEach(() => {
    vi.useRealTimers();
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

  it('keeps the playback scheduling in the gesture when the scene needs a countdown', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const player = new AudioTrackPlayer();
    await player.prepare(new ArrayBuffer(8));
    const context = FakeAudioContext.latest!;

    const startAttempt = player.startFromGesture(25, 40, 0.25, 3);

    expect(context.source.start).toHaveBeenCalledWith(15.04, 25);
    expect(await startAttempt).toBe(true);
  });

  it('times out and allows retry when iOS leaves resume pending', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const player = new AudioTrackPlayer();
    await player.prepare(new ArrayBuffer(8));
    const context = FakeAudioContext.latest!;
    context.resume.mockImplementation(() => new Promise<void>(() => undefined));

    const startAttempt = player.startFromGesture(25, 40, 0.25);

    expect(context.source.start).toHaveBeenCalledWith(12.04, 25);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await startAttempt).toBe(false);
    expect(context.source.stop).toHaveBeenLastCalledWith();
    expect(context.source.disconnect).toHaveBeenCalledOnce();
  });

  it('allows a fresh start-overlay unlock gesture after an earlier unlock failed', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const player = new AudioTrackPlayer();
    await player.prepare(new ArrayBuffer(8));
    const context = FakeAudioContext.latest!;
    context.resume.mockRejectedValueOnce(new Error('gesture required'));

    expect(await player.unlock()).toBe(false);
    expect(await player.unlock()).toBe(true);
    expect(context.state).toBe('running');
  });

  it('discards decoded audio when destroyed while decoding', async () => {
    // Given an unfinished decode owned by the old scene run.
    let finishDecode: (buffer: AudioBuffer) => void = () => undefined;
    class DelayedDecodeContext extends FakeAudioContext {
      override decodeAudioData = vi.fn(() => new Promise<AudioBuffer>((resolve) => { finishDecode = resolve; }));
    }
    vi.stubGlobal('AudioContext', DelayedDecodeContext);
    const player = new AudioTrackPlayer();
    const preparation = player.prepare(new ArrayBuffer(8));
    const context = FakeAudioContext.latest!;
    player.destroy();

    // When decoding completes after shutdown.
    finishDecode({ duration: 90 } as AudioBuffer);
    await preparation;

    // Then no buffer or gain is resurrected on the closed context.
    expect(player.durationSeconds).toBe(0);
    expect(context.createGain).not.toHaveBeenCalled();
  });

  it.each(['pending', 'rejected'])('preserves playback for a gesture retry when resume is %s', async (failure) => {
    // Given a paused track already partway through its scoring window.
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const player = new AudioTrackPlayer();
    await player.prepare(new ArrayBuffer(8));
    const context = FakeAudioContext.latest!;
    await player.startFromGesture(25, 40);
    context.currentTime = 17.04;
    await player.pause();
    context.resume.mockImplementationOnce(() => failure === 'pending'
      ? new Promise<void>(() => undefined)
      : Promise.reject(new Error('gesture required')));

    // When an automatic resume fails and the user retries.
    const resumed = player.resume();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await resumed).toBe(false);
    expect(await player.resume()).toBe(true);

    // Then the same source and offset survive, without a new set.
    expect(player.currentTimeSeconds).toBeCloseTo(30);
    expect(context.source.start).toHaveBeenCalledOnce();
    expect(context.source.disconnect).not.toHaveBeenCalled();
  });

  it('suspends a late resume after its bounded wait expired', async () => {
    // Given a resume that outlives the retry deadline.
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const player = new AudioTrackPlayer();
    await player.prepare(new ArrayBuffer(8));
    const context = FakeAudioContext.latest!;
    let finishResume = () => undefined;
    context.resume.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishResume = () => { context.state = 'running'; resolve(); };
    }));
    const attempt = player.resume();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await attempt).toBe(false);

    // When the browser eventually grants the old resume.
    finishResume();
    await Promise.resolve();
    await Promise.resolve();

    // Then audio remains paused until the retry gesture.
    expect(context.state).toBe('suspended');
  });

  it('keeps a scheduled countdown source when paused before resume settles', async () => {
    // Given playback scheduled synchronously from the final tutorial gesture.
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const player = new AudioTrackPlayer();
    await player.prepare(new ArrayBuffer(8));
    const context = FakeAudioContext.latest!;
    const attempt = player.startFromGesture(25, 40, 0.25, 3);

    // When orientation pauses the scene during the asynchronous resume.
    await player.pause();

    // Then resume can continue the original schedule instead of discarding it.
    expect(await attempt).toBe(true);
    expect(context.source.disconnect).not.toHaveBeenCalled();
    expect(context.state).toBe('suspended');
  });

});
