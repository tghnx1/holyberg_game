import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real package needs a DOM/canvas, and these tests run in the node
// environment; only the constants and JustDown used at runtime matter here.
vi.mock('phaser', () => ({
  default: {
    Core: { Events: { READY: 'ready' } },
    Scenes: { Events: { UPDATE: 'update', SHUTDOWN: 'shutdown' } },
    Input: { Keyboard: { KeyCodes: { E: 69 }, JustDown: (key: { justDown: boolean }) => key.justDown } },
  },
}));

// SceneEditor itself needs real Phaser display objects; installSceneEditors
// only needs to know it was constructed and can be toggled/registered on.
const sceneEditorInstances: Array<{
  active: boolean;
  register: ReturnType<typeof vi.fn>;
  replaceObjects: ReturnType<typeof vi.fn>;
  toggle: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}> = [];
vi.mock('../src/game/systems/SceneEditor', () => ({
  SceneEditor: vi.fn().mockImplementation(() => {
    const instance = {
      active: false,
      register: vi.fn(),
      replaceObjects: vi.fn(),
      toggle: vi.fn(function (this: { active: boolean }) {
        this.active = !this.active;
      }),
      update: vi.fn(),
    };
    sceneEditorInstances.push(instance);
    return instance;
  }),
}));

const { installSceneEditors } = await import('../src/game/systems/editableScene');

function createFakeKey() {
  return { justDown: false };
}

function createFakeScene(key: string, editableObjects: unknown[] = []) {
  const listeners = new Map<string, (() => void)[]>();
  const toggleKey = createFakeKey();
  return {
    key,
    input: { keyboard: { addKey: vi.fn(() => toggleKey) } },
    events: {
      on: (event: string, callback: () => void) => {
        const existing = listeners.get(event) ?? [];
        existing.push(callback);
        listeners.set(event, existing);
      },
      once: (event: string, callback: () => void) => {
        const existing = listeners.get(event) ?? [];
        existing.push(callback);
        listeners.set(event, existing);
      },
      off: (event: string, callback: () => void) => {
        const existing = listeners.get(event) ?? [];
        listeners.set(
          event,
          existing.filter((entry) => entry !== callback),
        );
      },
    },
    getEditableObjects: vi.fn(() => editableObjects),
    emit: (event: string) => {
      for (const callback of listeners.get(event) ?? []) callback();
    },
    pressToggleKey: () => {
      toggleKey.justDown = true;
    },
  };
}

/**
 * Mirrors the real boot ordering that `installPauseLifecycle` already
 * guards against: the SceneManager parks configured scenes in a private
 * pending list and only moves them into `scenes` when the game emits READY,
 * well after `new Phaser.Game()` returns.
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
      game.scene.scenes = pending;
      game.scene.isBooted = true;
      for (const callback of readyListeners) callback();
    },
  };
  return game;
}

const originalEnv = import.meta.env.DEV;

describe('installSceneEditors', () => {
  beforeEach(() => {
    sceneEditorInstances.length = 0;
    vi.stubEnv('DEV', true);
  });

  it('does nothing before the game has booted', () => {
    const dialogue = createFakeScene('DialogueScene', [{ id: 'portrait' }]);
    const game = createFakeGame([dialogue]);

    // main.ts calls this synchronously after `new Phaser.Game(config)`, when
    // the SceneManager's `scenes` array is still empty — the exact ordering
    // that silently attached the editor to nothing before this fix.
    installSceneEditors(game as never);
    dialogue.emit('update');
    dialogue.pressToggleKey();
    dialogue.emit('update');

    expect(dialogue.input.keyboard.addKey).not.toHaveBeenCalled();
  });

  it('opens on E once the game is ready, for a scene implementing EditableScene', () => {
    const dialogue = createFakeScene('DialogueScene', [{ id: 'portrait' }]);
    const game = createFakeGame([dialogue]);

    installSceneEditors(game as never);
    game.emitReady();

    // First update wires the toggle key; a second delivers the actual press.
    dialogue.emit('update');
    dialogue.pressToggleKey();
    dialogue.emit('update');

    expect(dialogue.input.keyboard.addKey).toHaveBeenCalledWith(69);
    expect(sceneEditorInstances).toHaveLength(1);
    expect(sceneEditorInstances[0].replaceObjects).toHaveBeenCalledWith([{ id: 'portrait' }]);
    expect(sceneEditorInstances[0].toggle).toHaveBeenCalledTimes(1);
    expect(sceneEditorInstances[0].active).toBe(true);
  });

  it('attaches to every ready scene implementing EditableScene, naming none of them', () => {
    const dialogue = createFakeScene('DialogueScene', []);
    const club = createFakeScene('ClubScene', []);
    const level4 = createFakeScene('Level4Scene', []);
    const game = createFakeGame([dialogue, club, level4]);

    installSceneEditors(game as never);
    game.emitReady();
    for (const scene of [dialogue, club, level4]) scene.emit('update');

    for (const scene of [dialogue, club, level4]) {
      expect(scene.input.keyboard.addKey).toHaveBeenCalledWith(69);
    }
  });

  it('skips a scene that does not implement EditableScene', () => {
    const boot = { key: 'BootScene', events: { on: vi.fn(), once: vi.fn() } };
    const game = createFakeGame([boot as never]);

    installSceneEditors(game as never);
    game.emitReady();

    expect(sceneEditorInstances).toHaveLength(0);
  });

  it('re-wires after a scene restart (SHUTDOWN resets the attach flag)', () => {
    const dialogue = createFakeScene('DialogueScene', []);
    const game = createFakeGame([dialogue]);

    installSceneEditors(game as never);
    game.emitReady();
    dialogue.emit('update');
    expect(dialogue.input.keyboard.addKey).toHaveBeenCalledTimes(1);

    dialogue.emit('shutdown');
    dialogue.emit('update');
    expect(dialogue.input.keyboard.addKey).toHaveBeenCalledTimes(2);
  });

  it('is a no-op outside dev builds', () => {
    vi.stubEnv('DEV', false);
    const dialogue = createFakeScene('DialogueScene', []);
    const game = createFakeGame([dialogue]);

    installSceneEditors(game as never);
    game.emitReady();
    dialogue.emit('update');

    expect(dialogue.input.keyboard.addKey).not.toHaveBeenCalled();
    vi.stubEnv('DEV', originalEnv);
  });
});
