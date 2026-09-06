import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real package needs a DOM/canvas, and these tests run in the node
// environment; only the constants read at construction/destroy matter here.
vi.mock('phaser', () => ({
  default: {
    Input: {
      Keyboard: { KeyCodes: { A: 65, D: 68 } },
      Events: { POINTER_UP: 'pointerup', POINTER_UP_OUTSIDE: 'pointerupoutside', GAME_OUT: 'gameout' },
    },
    Scenes: { Events: { PAUSE: 'pause', RESUME: 'resume' } },
  },
}));

import { WalkInput } from '../src/game/systems/WalkControls';

/**
 * Minimal stand-in for a Phaser.Scene: enough of `input`, `events` and
 * `add.zone` for `WalkInput` to construct its touch zones and listen for
 * pointer/scene-lifecycle events, without a running Phaser game.
 */
function fakeScene(touch = true) {
  const inputListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const sceneListeners = new Map<string, Set<() => void>>();
  const on = (map: Map<string, Set<(...args: unknown[]) => void>>) =>
    (event: string, cb: (...args: unknown[]) => void) => {
      let set = map.get(event);
      if (!set) {
        set = new Set();
        map.set(event, set);
      }
      set.add(cb);
    };
  const off = (map: Map<string, Set<(...args: unknown[]) => void>>) =>
    (event: string, cb: (...args: unknown[]) => void) => {
      map.get(event)?.delete(cb);
    };
  const fire = (map: Map<string, Set<(...args: unknown[]) => void>>) =>
    (event: string, ...args: unknown[]) => {
      for (const cb of map.get(event) ?? []) cb(...args);
    };

  interface FakeZone {
    setOrigin: () => FakeZone;
    setScrollFactor: () => FakeZone;
    setDepth: () => FakeZone;
    setInteractive: () => FakeZone;
    setPosition: () => FakeZone;
    setSize: () => FakeZone;
    on: (event: string, cb: (pointer: { id: number }) => void) => FakeZone;
    trigger: (event: string, pointer: { id: number }) => void;
    destroy: () => void;
  }
  const zones: FakeZone[] = [];
  const makeZone = (): FakeZone => {
    const handlers = new Map<string, (pointer: { id: number }) => void>();
    const zone: FakeZone = {
      setOrigin: () => zone,
      setScrollFactor: () => zone,
      setDepth: () => zone,
      setInteractive: () => zone,
      setPosition: () => zone,
      setSize: () => zone,
      on(event, cb) {
        handlers.set(event, cb);
        return zone;
      },
      trigger(event, pointer) {
        handlers.get(event)?.(pointer);
      },
      destroy: vi.fn(),
    };
    zones.push(zone);
    return zone;
  };

  const scene = {
    game: { device: { input: { touch } } },
    input: {
      keyboard: {
        createCursorKeys: () => ({ left: { isDown: false }, right: { isDown: false } }),
        addKey: () => ({ isDown: false }),
      },
      addPointer: vi.fn(),
      on: on(inputListeners),
      off: off(inputListeners),
    },
    events: {
      on: on(sceneListeners),
      off: off(sceneListeners),
    },
    add: { zone: makeZone },
  };

  return {
    scene: scene as never,
    zones,
    fireInput: fire(inputListeners),
    fireSceneEvent: fire(sceneListeners),
  };
}

describe('WalkInput touch state across a paused (dialogue) scene', () => {
  let env: ReturnType<typeof fakeScene>;
  let walk: WalkInput;

  beforeEach(() => {
    env = fakeScene(true);
    walk = new WalkInput(env.scene, { zoneDepth: 0 });
  });

  const holdLeft = (id = 1): void => {
    env.zones[0].trigger('pointerdown', { id });
  };
  const holdRight = (id = 1): void => {
    env.zones[1].trigger('pointerdown', { id });
  };

  it('regression: touch held -> scene paused -> released while paused -> resumed -> direction is 0', () => {
    holdLeft();
    expect(walk.direction).toBe(-1);

    // The scene pauses for a dialogue while the finger is still down.
    env.fireSceneEvent('pause');

    // The finger lifts while paused: Phaser would not deliver this event to
    // a paused scene in the real game, so this call is deliberately omitted
    // here — the point of the fix is that it must not matter either way.

    env.fireSceneEvent('resume');

    expect(walk.direction).toBe(0);
  });

  it('clears a held pointer immediately on pause, before any resume', () => {
    holdRight();
    expect(walk.direction).toBe(1);

    env.fireSceneEvent('pause');

    expect(walk.direction).toBe(0);
  });

  it('normal touch hold and release (no pause involved) is unaffected', () => {
    holdLeft(7);
    expect(walk.direction).toBe(-1);

    env.fireInput('pointerup', { id: 7 });

    expect(walk.direction).toBe(0);
  });

  it('a hold that starts after resume still works normally', () => {
    env.fireSceneEvent('pause');
    env.fireSceneEvent('resume');

    holdRight();

    expect(walk.direction).toBe(1);
  });

  it('destroy() removes the pause/resume listeners, so a torn-down instance is inert', () => {
    holdLeft();
    walk.destroy();
    // A pause firing after destroy must not throw or resurrect state.
    expect(() => env.fireSceneEvent('pause')).not.toThrow();
  });
});

describe('WalkInput on a non-touch device', () => {
  it('registers no touch zones, and pause/resume wiring is still harmless', () => {
    const env = fakeScene(false);
    const walk = new WalkInput(env.scene, { zoneDepth: 0 });

    expect(env.zones).toHaveLength(0);
    expect(() => env.fireSceneEvent('pause')).not.toThrow();
    expect(() => env.fireSceneEvent('resume')).not.toThrow();
    expect(walk.direction).toBe(0);
  });
});
