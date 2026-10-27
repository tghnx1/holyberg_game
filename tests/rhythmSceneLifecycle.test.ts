import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';

vi.mock('phaser', () => ({ default: { Scene: class {} } }));
vi.mock('../src/game/rhythm/MidiChartLoader', () => ({
  parseMidiChart: () => ({ notes: [], bpm: 120, duration: 90 }),
  formatChartStatistics: () => '',
}));
vi.mock('../src/game/rhythm/TrackLoader', () => ({ parseTrackMetadata: () => ({}) }));
vi.mock('../src/game/rhythm/RhythmPlaybackWindow', () => ({
  resolveRhythmPlaybackWindow: () => ({ startSeconds: 0, endSeconds: 90 }),
  selectRhythmNotesInWindow: () => [],
}));
import { RhythmScene } from '../src/game/scenes/RhythmScene';
import { AudioTrackPlayer } from '../src/game/rhythm/AudioTrackPlayer';
import { RhythmClock } from '../src/game/rhythm/RhythmClock';

function preparationHarness() {
  const scene = new RhythmScene();
  const assets = new Map([['rhythm-track-midi', new ArrayBuffer(8)], ['rhythm-track-audio', new ArrayBuffer(8)]]);
  Object.assign(scene, {
    cache: { json: { get: () => ({}) }, binary: { get: (key: string) => assets.get(key), remove: (key: string) => assets.delete(key) } },
    scene: { isActive: () => false },
  });
  const build = vi.fn();
  const fatal = vi.fn();
  Object.assign(scene, { build, showFatalError: fatal });
  const loading = { destroy: vi.fn() } as Partial<Phaser.GameObjects.Text> as Phaser.GameObjects.Text;
  return { scene, assets, build, fatal, loading };
}

afterEach(() => vi.restoreAllMocks());

describe('Rhythm scene asynchronous lifetime', () => {
  it('finishes preparation when the current run is paused during decode', async () => {
    // Given a paused scene with unfinished audio preparation.
    const { scene, build, loading } = preparationHarness();
    let complete: () => void = () => undefined;
    vi.spyOn(AudioTrackPlayer.prototype, 'prepare').mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
    const preparation = scene['prepareTrack'](loading);

    // When the current decode completes while isActive remains false.
    complete();
    await preparation;

    // Then the start surface is built instead of stranding the loading screen.
    expect(build).toHaveBeenCalledOnce();
    expect(loading.destroy).toHaveBeenCalledOnce();
    scene['unsubscribeSoundManager']?.();
    scene['unsubscribeMusicVolume']?.();
  });

  it.each(['resolve', 'reject'])('ignores an old decode that %ss after a new run takes ownership', async (settlement) => {
    // Given an old decode and a replacement run with its own cache entry.
    const { scene, assets, build, fatal, loading } = preparationHarness();
    let complete: () => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    vi.spyOn(AudioTrackPlayer.prototype, 'prepare').mockImplementation(() => new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; }));
    const preparation = scene['prepareTrack'](loading);
    scene['runId'] += 1;
    const replacementAudio = new ArrayBuffer(16);
    assets.set('rhythm-track-audio', replacementAudio);

    // When the superseded asynchronous operation settles.
    if (settlement === 'resolve') complete();
    else fail(new Error('old decode failed'));
    await preparation;

    // Then it cannot build, subscribe, remove current cache, or display a fatal error.
    expect(build).not.toHaveBeenCalled();
    expect(fatal).not.toHaveBeenCalled();
    expect(loading.destroy).not.toHaveBeenCalled();
    expect(scene['unsubscribeSoundManager']).toBeUndefined();
    expect(assets.get('rhythm-track-audio')).toBe(replacementAudio);
  });

  it('clears lost touch releases and resumes the clock after a global pause', async () => {
    // Given gameplay with a held pointer and a running source clock.
    const scene = new RhythmScene();
    const source = { currentTimeSeconds: 12 };
    scene['clock'] = new RhythmClock(source);
    scene['clock'].start();
    Object.assign(scene, { time: { paused: false } });
    scene['inputGuard'].beginPointer(1, 0, 0);
    scene.onGamePause();
    source.currentTimeSeconds = 14;
    expect(scene['clock'].currentTimeSeconds).toBe(12);

    // When the global resume completes.
    await scene['resumeAudio']();

    // Then time advances and the same pointer can be pressed again.
    expect(scene['clock'].currentTimeSeconds).toBe(14);
    expect(scene['inputGuard'].beginPointer(1, 0, 100)).toBe(true);
    expect(scene.time.paused).toBe(false);
  });
});
