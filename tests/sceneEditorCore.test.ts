import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The real package needs a DOM/canvas; these run in the node environment, so
 * only the handful of constants and helpers the core actually calls are here.
 * `JustDown` reads a flag the fake keys expose, which is how a test presses a
 * key without a browser.
 */
vi.mock('phaser', () => ({
  default: {
    Input: {
      Events: {
        POINTER_DOWN: 'pointerdown',
        POINTER_MOVE: 'pointermove',
        POINTER_UP: 'pointerup',
        POINTER_WHEEL: 'wheel',
      },
      Keyboard: {
        KeyCodes: {
          SHIFT: 16,
          C: 67,
          V: 86,
          PLUS: 187,
          NUMPAD_ADD: 107,
          MINUS: 189,
          NUMPAD_SUBTRACT: 109,
          DELETE: 46,
          BACKSPACE: 8,
          ESC: 27,
          P: 80,
          CLOSED_BRACKET: 221,
          OPEN_BRACKET: 219,
        },
        JustDown: (key: { justDown?: boolean }) => key.justDown === true,
      },
    },
    Math: { Clamp: (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)) },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  },
}));
vi.mock('../src/game/systems/sceneEditorState', () => ({
  setSceneEditorActive: vi.fn(),
}));

const { SceneEditorCore } = await import('../src/game/systems/editor/SceneEditorCore');
import type { EditableItem } from '../src/game/systems/editor/editorItem';
import type { ResizeBounds } from '../src/game/systems/levelEditorResize';

function chainableText() {
  const text = {
    setOrigin: () => text,
    setScrollFactor: () => text,
    setDepth: () => text,
    setVisible: () => text,
    setText: () => text,
    setPosition: () => text,
    setScale: () => text,
    destroy: () => {},
  };
  return text;
}

function chainableGraphics() {
  const graphics = {
    setDepth: () => graphics,
    setScrollFactor: () => graphics,
    setVisible: () => graphics,
    clear: () => graphics,
    fillStyle: () => graphics,
    lineStyle: () => graphics,
    fillRect: () => graphics,
    strokeRect: () => graphics,
    fillCircle: () => graphics,
    lineBetween: () => graphics,
    destroy: () => {},
  };
  return graphics;
}

interface FakeKey {
  justDown?: boolean;
  isDown?: boolean;
}

function createScene() {
  const keys = new Map<number, FakeKey>();
  const pointerHandlers = new Map<
    string,
    { handler: (pointer: unknown) => void; context: unknown }[]
  >();
  const cursors = {
    left: {} as FakeKey,
    right: {} as FakeKey,
    up: {} as FakeKey,
    down: {} as FakeKey,
  };
  const camera = { scrollX: 0, scrollY: 0, zoom: 1, width: 1280, height: 720 };
  const physics = { world: { isPaused: false, pause() { physics.world.isPaused = true; }, resume() { physics.world.isPaused = false; } } };
  const scene = {
    add: { graphics: chainableGraphics, text: chainableText },
    scale: { width: 1280 },
    cameras: { main: camera },
    // The core freezes the scene it edits, so the fake has to offer the
    // handles it reaches for.
    tweens: { paused: false, pauseAll() { scene.tweens.paused = true; }, resumeAll() { scene.tweens.paused = false; } },
    physics,
    time: { paused: false, delayedCall: () => ({ remove: () => {} }) },
    input: {
      keyboard: {
        createCursorKeys: () => cursors,
        addKey: (code: number) => {
          const existing = keys.get(code);
          if (existing) return existing;
          const key: FakeKey = {};
          keys.set(code, key);
          return key;
        },
      },
      // Phaser passes a `context` third argument, and the core relies on it
      // for `this`; the fake must honour it or every handler sees `this` null.
      on: (event: string, handler: (pointer: unknown) => void, context: unknown) => {
        const list = pointerHandlers.get(event) ?? [];
        list.push({ handler, context });
        pointerHandlers.set(event, list);
      },
      off: () => {},
    },
    events: { once: () => {} },
  };
  return {
    scene,
    camera,
    cursors,
    key: (code: number) => keys.get(code),
    physicsPaused: () => physics.world.isPaused,
    emit: (event: string, pointer: unknown) => {
      for (const entry of pointerHandlers.get(event) ?? []) {
        entry.handler.call(entry.context, pointer);
      }
    },
  };
}

function pointerAt(x: number, y: number, isDown = true) {
  return { x, y, worldX: x, worldY: y, isDown, deltaY: 0 };
}

/** A minimal item whose bounds live in a plain mutable box. */
function makeItem(id: string, box: ResizeBounds, over: Partial<EditableItem> = {}): EditableItem {
  let bounds = { ...box };
  return {
    id,
    getBounds: () => ({ ...bounds }),
    setBounds: (next) => {
      bounds = { ...next };
    },
    ...over,
  };
}

describe('shared editor core', () => {
  let harness: ReturnType<typeof createScene>;

  beforeEach(() => {
    harness = createScene();
  });

  function build(options = {}) {
    return new SceneEditorCore(harness.scene as never, options);
  }

  it('does nothing at all until it is toggled on', () => {
    const core = build();
    const item = makeItem('a', { left: 0, top: 0, right: 50, bottom: 50 });
    core.register(item);
    harness.emit('pointerdown', pointerAt(10, 10));
    expect(core.getSelectedId()).toBeUndefined();
  });

  it('selects the item under the pointer', () => {
    const core = build();
    core.register(makeItem('a', { left: 0, top: 0, right: 50, bottom: 50 }));
    core.toggle();
    harness.emit('pointerdown', pointerAt(10, 10));
    expect(core.getSelectedId()).toBe('a');
  });

  it('prefers the later-registered item where two overlap', () => {
    const core = build();
    core.register(makeItem('under', { left: 0, top: 0, right: 100, bottom: 100 }));
    core.register(makeItem('over', { left: 0, top: 0, right: 100, bottom: 100 }));
    core.toggle();
    harness.emit('pointerdown', pointerAt(50, 50));
    expect(core.getSelectedId()).toBe('over');
  });

  it('drags the selection by the pointer delta', () => {
    const core = build();
    const item = makeItem('a', { left: 0, top: 0, right: 50, bottom: 50 });
    core.register(item);
    core.toggle();
    harness.emit('pointerdown', pointerAt(25, 25));
    harness.emit('pointermove', pointerAt(45, 35));
    expect(item.getBounds()).toEqual({ left: 20, top: 10, right: 70, bottom: 60 });
  });

  it('resizes from a handle, holding the opposite corner still', () => {
    const core = build();
    const item = makeItem('a', { left: 0, top: 0, right: 100, bottom: 100 }, {
      preserveAspect: () => false,
    });
    core.register(item);
    core.toggle();
    core.select('a');
    // Grab the south-east handle and drag it out.
    harness.emit('pointerdown', pointerAt(100, 100));
    harness.emit('pointermove', pointerAt(150, 130));
    const bounds = item.getBounds();
    expect(bounds.left).toBeCloseTo(0);
    expect(bounds.top).toBeCloseTo(0);
    expect(bounds.right).toBeCloseTo(150);
    expect(bounds.bottom).toBeCloseTo(130);
  });

  it('pans the camera when the drag starts on empty space, keeping the selection', () => {
    const core = build();
    core.register(makeItem('a', { left: 0, top: 0, right: 50, bottom: 50 }));
    core.toggle();
    core.select('a');
    harness.emit('pointerdown', pointerAt(600, 400));
    harness.emit('pointermove', pointerAt(560, 380));
    expect(harness.camera.scrollX).toBe(40);
    expect(harness.camera.scrollY).toBe(20);
    // Kept, so you can scroll across a level and still paste what you copied.
    expect(core.getSelectedId()).toBe('a');
  });

  it('nudges the selection with the arrow keys', () => {
    const core = build();
    const item = makeItem('a', { left: 0, top: 0, right: 50, bottom: 50 });
    core.register(item);
    core.toggle();
    core.select('a');
    harness.cursors.right.justDown = true;
    harness.cursors.right.isDown = true;
    core.update();
    expect(item.getBounds().left).toBe(1);
  });

  it('scrolls instead of nudging when nothing is selected', () => {
    const core = build();
    core.register(makeItem('a', { left: 0, top: 0, right: 50, bottom: 50 }));
    core.toggle();
    harness.cursors.right.isDown = true;
    core.update();
    expect(harness.camera.scrollX).toBeGreaterThan(0);
  });

  it('grows the selection about its centre with +', () => {
    const core = build();
    const item = makeItem('a', { left: 0, top: 0, right: 100, bottom: 100 });
    core.register(item);
    core.toggle();
    core.select('a');
    harness.key(187)!.justDown = true;
    core.update();
    const bounds = item.getBounds();
    expect(bounds.right - bounds.left).toBeGreaterThan(100);
    // Centre held.
    expect((bounds.left + bounds.right) / 2).toBeCloseTo(50);
  });

  it('zooms on the wheel, within limits', () => {
    const core = build();
    core.toggle();
    harness.emit('wheel', { ...pointerAt(0, 0), deltaY: -1 });
    expect(harness.camera.zoom).toBeGreaterThan(1);
    for (let i = 0; i < 200; i += 1) harness.emit('wheel', { ...pointerAt(0, 0), deltaY: 1 });
    expect(harness.camera.zoom).toBeGreaterThanOrEqual(0.15);
  });

  it('restores the item exactly when Esc cancels a drag', () => {
    const core = build();
    const restore = vi.fn();
    const item = makeItem('a', { left: 0, top: 0, right: 50, bottom: 50 }, {
      beginEdit: () => restore,
    });
    core.register(item);
    core.toggle();
    harness.emit('pointerdown', pointerAt(25, 25));
    harness.emit('pointermove', pointerAt(200, 200));
    harness.key(27)!.justDown = true;
    core.update();
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('closes the edit session on pointer up, so a baseline is not reused', () => {
    const core = build();
    const endEdit = vi.fn();
    core.register(
      makeItem('a', { left: 0, top: 0, right: 50, bottom: 50 }, {
        beginEdit: () => () => {},
        endEdit,
      }),
    );
    core.toggle();
    harness.emit('pointerdown', pointerAt(25, 25));
    harness.emit('pointerup', pointerAt(25, 25, false));
    expect(endEdit).toHaveBeenCalledTimes(1);
  });

  it('saves on P through the scene-supplied callback', () => {
    const onSave = vi.fn();
    const core = build({ onSave });
    core.toggle();
    harness.key(80)!.justDown = true;
    core.update();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  /**
   * Opening the editor freezes the scene being edited, so a cutscene stops
   * advancing and the object under the cursor stays where it is while it is
   * positioned. Owned by the core, so it holds for every scene alike.
   */
  it('freezes tweens, physics and the scene clock while the editor is open', () => {
    const core = build();
    expect(harness.scene.time.paused).toBe(false);

    core.toggle();
    expect(harness.scene.time.paused).toBe(true);
    expect(harness.scene.tweens.paused).toBe(true);
    expect(harness.physicsPaused()).toBe(true);

    core.toggle();
    expect(harness.scene.time.paused).toBe(false);
    expect(harness.scene.tweens.paused).toBe(false);
    expect(harness.physicsPaused()).toBe(false);
  });

  it('keeps running its own update loop while the scene is frozen', () => {
    // The freeze must not switch the editor itself off: it is driven by the
    // scene's update event and pointer input, not by the scene clock.
    const core = build();
    const item = makeItem('a', { left: 0, top: 0, right: 50, bottom: 50 });
    core.register(item);
    core.toggle();
    core.select('a');
    harness.cursors.right.justDown = true;
    harness.cursors.right.isDown = true;
    core.update();
    expect(item.getBounds().left).toBe(1);
  });

  it('reports enable and disable so a scene can freeze its own progression', () => {
    const onEnable = vi.fn();
    const onDisable = vi.fn();
    const core = build({ onEnable, onDisable });
    core.toggle();
    expect(onEnable).toHaveBeenCalledTimes(1);
    core.toggle();
    expect(onDisable).toHaveBeenCalledTimes(1);
  });
});

/**
 * Copy/paste and delete are offered for exactly the items that declare the
 * capability. This is what keeps duplication off Level 4's single toilet
 * backdrop and every scene's main player without the core naming either.
 */
describe('cloning is a declared capability', () => {
  let harness: ReturnType<typeof createScene>;
  beforeEach(() => {
    harness = createScene();
  });

  function copyThenPaste(core: InstanceType<typeof SceneEditorCore>) {
    harness.key(67)!.justDown = true;
    core.update();
    harness.key(67)!.justDown = false;
    harness.key(86)!.justDown = true;
    core.update();
    harness.key(86)!.justDown = false;
  }

  it('duplicates an item that declares clone, and selects the copy', () => {
    const core = new SceneEditorCore(harness.scene as never, {});
    const source = makeItem('npc', { left: 0, top: 0, right: 40, bottom: 40 }, {
      clone: () => {
        const copy = makeItem('npc-copy', { left: 0, top: 0, right: 40, bottom: 40 });
        core.register(copy);
        return copy.id;
      },
    });
    core.register(source);
    core.toggle();
    core.select('npc');
    copyThenPaste(core);

    expect(core.getItems().map((item) => item.id)).toContain('npc-copy');
    expect(core.getSelectedId()).toBe('npc-copy');
    // Offset so the copy is not hidden exactly under the original.
    const copy = core.getItems().find((item) => item.id === 'npc-copy')!;
    expect(copy.getBounds().left).toBeGreaterThan(0);
  });

  it('refuses to copy an item with no clone, leaving the scene untouched', () => {
    const core = new SceneEditorCore(harness.scene as never, {});
    // Exactly the shape of Level 4's toilet backdrop and the main player.
    core.register(makeItem('toilet', { left: 0, top: 0, right: 100, bottom: 100 }));
    core.toggle();
    core.select('toilet');
    copyThenPaste(core);
    expect(core.getItems()).toHaveLength(1);
  });

  it('deletes only an item that declares remove', () => {
    const core = new SceneEditorCore(harness.scene as never, {});
    const removed = vi.fn();
    core.register(makeItem('keep', { left: 0, top: 0, right: 10, bottom: 10 }));
    core.register(
      makeItem('drop', { left: 20, top: 0, right: 30, bottom: 10 }, { remove: removed }),
    );
    core.toggle();

    core.select('keep');
    harness.key(46)!.justDown = true;
    core.update();
    harness.key(46)!.justDown = false;
    expect(core.getItems()).toHaveLength(2);

    core.select('drop');
    harness.key(46)!.justDown = true;
    core.update();
    expect(removed).toHaveBeenCalledTimes(1);
    expect(core.getItems().map((item) => item.id)).toEqual(['keep']);
  });
});
