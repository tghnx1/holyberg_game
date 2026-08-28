import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real package needs a DOM/canvas, and these tests run in the node
// environment; only the two event-name constants are used at runtime.
vi.mock('phaser', () => ({
  default: {
    Core: { Events: { READY: 'ready' } },
    Scenes: { Events: { CREATE: 'create' } },
  },
}));
vi.mock('../src/game/systems/pause/PauseControl', () => ({
  attachPauseControl: vi.fn(),
}));

const { attachPauseControl } = await import('../src/game/systems/pause/PauseControl');
const { installPauseLifecycle } = await import('../src/game/systems/pause/installPauseLifecycle');

function createFakeScene(key: string, active = false) {
  const listeners = new Map<string, (() => void)[]>();
  return {
    key,
    sys: {
      isActive: () => active,
      events: {
        on: (event: string, callback: () => void) => {
          const existing = listeners.get(event) ?? [];
          existing.push(callback);
          listeners.set(event, existing);
        },
      },
    },
    emit: (event: string) => {
      for (const callback of listeners.get(event) ?? []) callback();
    },
  };
}

/**
 * Mirrors the real boot ordering that the original bug turned on: the
 * SceneManager parks configured scenes in a private pending list and only
 * moves them into `scenes` when the game emits READY, which happens well
 * after `new Phaser.Game()` returns.
 */
function createFakeGame(pending: ReturnType<typeof createFakeScene>[]) {
  const readyListeners: (() => void)[] = [];
  const game = {
    scene: { scenes: [] as ReturnType<typeof createFakeScene>[], isBooted: false },
    events: {
      once: (event: string, callback: () => void) => {
        if (event === 'ready') readyListeners.push(callback);
      },
    },
    emitReady: () => {
      // bootQueue runs first (it registered its listener in the SceneManager
      // constructor, before anything main.ts installs) and populates `scenes`.
      game.scene.scenes = pending;
      game.scene.isBooted = true;
      for (const callback of readyListeners) callback();
    },
  };
  return game;
}

describe('installPauseLifecycle', () => {
  beforeEach(() => {
    vi.mocked(attachPauseControl).mockClear();
  });

  it('still attaches when installed before the game has booted', () => {
    const berlin = createFakeScene('BerlinScene');
    const game = createFakeGame([berlin]);

    // main.ts calls this synchronously after `new Phaser.Game(config)`, when
    // the SceneManager's `scenes` array is still empty.
    installPauseLifecycle(game as never);
    expect(attachPauseControl).not.toHaveBeenCalled();

    game.emitReady();
    berlin.emit('create');

    expect(attachPauseControl).toHaveBeenCalledWith(berlin);
  });

  it('attaches to every scene the manager ends up with, naming none of them', () => {
    const scenes = [createFakeScene('BerlinScene'), createFakeScene('ClubScene'), createFakeScene('FutureScene')];
    const game = createFakeGame(scenes);

    installPauseLifecycle(game as never);
    game.emitReady();
    for (const scene of scenes) scene.emit('create');

    expect(attachPauseControl).toHaveBeenCalledTimes(3);
    for (const scene of scenes) expect(attachPauseControl).toHaveBeenCalledWith(scene);
  });

  it('re-attaches on every create, so a restarted scene gets its controls back', () => {
    const berlin = createFakeScene('BerlinScene');
    const game = createFakeGame([berlin]);

    installPauseLifecycle(game as never);
    game.emitReady();
    berlin.emit('create');
    berlin.emit('create');

    expect(attachPauseControl).toHaveBeenCalledTimes(2);
  });

  it('attaches immediately to a scene whose create already fired during boot', () => {
    const boot = createFakeScene('BootScene', true);
    const game = createFakeGame([boot]);

    installPauseLifecycle(game as never);
    game.emitReady();

    expect(attachPauseControl).toHaveBeenCalledWith(boot);
  });

  it('attaches inline when the game has already booted', () => {
    const berlin = createFakeScene('BerlinScene');
    const game = createFakeGame([berlin]);
    game.scene.scenes = [berlin];
    game.scene.isBooted = true;

    installPauseLifecycle(game as never);
    berlin.emit('create');

    expect(attachPauseControl).toHaveBeenCalledWith(berlin);
  });
});
