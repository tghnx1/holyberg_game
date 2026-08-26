import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import {
  __resetPauseStateForTests,
  isPaused,
  requestPause,
  resumeFromPause,
  restartFromPause,
  PAUSE_SCENE_KEY,
} from '../src/game/systems/pause/PauseCoordinator';

/**
 * Minimal fake matching only the surface PauseCoordinator touches:
 * `scene.scene.{key,pause,resume,launch,stop,start,get,settings.data}` plus
 * the optional `onGamePause`/`onGameResume` hooks. Registered in a shared
 * map so `scene.scene.get(key)` resolves like the real SceneManager would.
 */
function createFakeScene(key: string, data: unknown, registry: Map<string, unknown>) {
  const scene: Record<string, unknown> = {
    onGamePause: vi.fn(),
    onGameResume: vi.fn(),
  };
  scene.scene = {
    key,
    settings: { data },
    pause: vi.fn(),
    resume: vi.fn(),
    launch: vi.fn(),
    stop: vi.fn(),
    start: vi.fn(),
    get: vi.fn((k: string) => registry.get(k)),
  };
  registry.set(key, scene);
  return scene as unknown as {
    scene: {
      key: string;
      settings: { data: unknown };
      pause: ReturnType<typeof vi.fn>;
      resume: ReturnType<typeof vi.fn>;
      launch: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
    };
    onGamePause: ReturnType<typeof vi.fn>;
    onGameResume: ReturnType<typeof vi.fn>;
  };
}

describe('PauseCoordinator', () => {
  beforeEach(() => {
    __resetPauseStateForTests();
  });

  it('pauses the scene, calls its onGamePause hook, and launches the overlay with its entry data', () => {
    const registry = new Map<string, unknown>();
    const berlin = createFakeScene('BerlinScene', { retry: true }, registry);

    requestPause(berlin as unknown as Phaser.Scene);

    expect(isPaused()).toBe(true);
    expect(berlin.onGamePause).toHaveBeenCalledOnce();
    expect(berlin.scene.pause).toHaveBeenCalledWith('BerlinScene');
    expect(berlin.scene.launch).toHaveBeenCalledWith(PAUSE_SCENE_KEY, {
      targetKey: 'BerlinScene',
      entryData: { retry: true },
    });
  });

  it('is a no-op if something is already paused', () => {
    const registry = new Map<string, unknown>();
    const berlin = createFakeScene('BerlinScene', {}, registry);
    const club = createFakeScene('ClubScene', {}, registry);

    requestPause(berlin as unknown as Phaser.Scene);
    requestPause(club as unknown as Phaser.Scene);

    expect(club.scene.pause).not.toHaveBeenCalled();
  });

  it('resume stops the overlay, calls onGameResume, and resumes the target scene', () => {
    const registry = new Map<string, unknown>();
    const berlin = createFakeScene('BerlinScene', {}, registry);
    const pauseScene = createFakeScene(PAUSE_SCENE_KEY, undefined, registry);

    requestPause(berlin as unknown as Phaser.Scene);
    resumeFromPause(pauseScene as unknown as Phaser.Scene);

    expect(pauseScene.scene.stop).toHaveBeenCalledWith(PAUSE_SCENE_KEY);
    expect(berlin.onGameResume).toHaveBeenCalledOnce();
    expect(pauseScene.scene.resume).toHaveBeenCalledWith('BerlinScene');
    expect(isPaused()).toBe(false);
  });

  it('restart stops the target scene and starts it again with the same entry data', () => {
    const registry = new Map<string, unknown>();
    const berlin = createFakeScene('BerlinScene', { levelSeed: 42 }, registry);
    const pauseScene = createFakeScene(PAUSE_SCENE_KEY, undefined, registry);

    requestPause(berlin as unknown as Phaser.Scene);
    restartFromPause(pauseScene as unknown as Phaser.Scene);

    expect(pauseScene.scene.stop).toHaveBeenCalledWith(PAUSE_SCENE_KEY);
    expect(pauseScene.scene.stop).toHaveBeenCalledWith('BerlinScene');
    expect(pauseScene.scene.start).toHaveBeenCalledWith('BerlinScene', { levelSeed: 42 });
    expect(isPaused()).toBe(false);
  });

  it('resume/restart are no-ops when nothing is paused', () => {
    const registry = new Map<string, unknown>();
    const pauseScene = createFakeScene(PAUSE_SCENE_KEY, undefined, registry);

    resumeFromPause(pauseScene as unknown as Phaser.Scene);
    restartFromPause(pauseScene as unknown as Phaser.Scene);

    expect(pauseScene.scene.stop).not.toHaveBeenCalled();
  });
});
