import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// The real package needs a DOM/canvas, and these tests run in the node
// environment; only the constants read at construction/destroy matter here.
vi.mock('phaser', () => ({
  default: {
    Scale: { Events: { RESIZE: 'resize' } },
    Scenes: { Events: { SHUTDOWN: 'shutdown', RESUME: 'resume' } },
  },
}));

import { OrientationController } from '../src/game/responsive/OrientationController';

/**
 * Minimal stand-in for a Phaser.Scene: enough of `scale` and `events` for the
 * controller to construct and listen for resize. Both sizes used below stay
 * landscape (width > height), so `refresh()` never reaches the
 * portrait/overlay branch — the one part of this class that genuinely needs
 * a browser (`window.setTimeout`, `document.createElement`) and is out of
 * scope for this fix.
 */
function fakeScene(width: number, height: number, touch = false, initiallyPaused = false) {
  let resizeHandler: (() => void) | undefined;
  let paused = initiallyPaused;
  const events = new EventEmitter();
  const scene = {
    scale: {
      parentSize: { width, height },
      game: { device: { input: { touch } } },
      on: (_event: string, handler: () => void) => {
        resizeHandler = handler;
      },
      off: () => {
        resizeHandler = undefined;
      },
    },
    events,
    scene: {
      isPaused: () => paused,
      pause: vi.fn(() => { paused = true; }),
      resume: vi.fn(() => { paused = false; events.emit('resume'); }),
    },
  };
  return {
    scene: scene as never,
    sceneControl: scene.scene,
    scaleState: scene.scale,
    triggerResize: () => resizeHandler?.(),
  };
}

describe('OrientationController and a focused text field', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([false, true])('preserves an existing pause (%s) through rotation', (paused) => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('navigator', { userAgent: 'test' });
    vi.stubGlobal('document', {
      activeElement: null,
      getElementById: () => ({ append: vi.fn() }),
      createElement: () => ({ append: vi.fn(), remove: vi.fn(), setAttribute: vi.fn() }),
    });
    const { scene, sceneControl, scaleState, triggerResize } = fakeScene(844, 390, true, paused);
    const onResume = vi.fn();
    const controller = new OrientationController(scene, { onResume });

    scaleState.parentSize = { width: 390, height: 844 };
    triggerResize();
    scaleState.parentSize = { width: 844, height: 390 };
    triggerResize();

    expect(sceneControl.isPaused()).toBe(paused);
    expect(onResume).toHaveBeenCalledTimes(paused ? 0 : 1);
    controller.destroy();
  });

  it('reports every resize through onLayout when nothing is focused', () => {
    const onLayout = vi.fn();
    const { scaleState, scene, triggerResize } = fakeScene(1280, 720);
    new OrientationController(scene, { onLayout });
    onLayout.mockClear();

    scaleState.parentSize = { width: 1000, height: 600 };
    triggerResize();

    expect(onLayout).toHaveBeenCalledTimes(1);
    expect(onLayout).toHaveBeenCalledWith(expect.objectContaining({ physicalWidth: 1000, physicalHeight: 600 }));
  });

  it('drops a resize entirely while a text input has focus, so it cannot steal keystrokes', () => {
    vi.stubGlobal('document', {
      activeElement: { tagName: 'INPUT', type: 'text' },
    });
    const onLayout = vi.fn();
    const { scaleState, scene, triggerResize } = fakeScene(1280, 720);
    new OrientationController(scene, { onLayout });
    onLayout.mockClear();

    // On-screen keyboard opening shrinks the layout viewport the same way a
    // real resize/rotation would, which is exactly the case this must ignore.
    scaleState.parentSize = { width: 1000, height: 600 };
    triggerResize();

    expect(onLayout).not.toHaveBeenCalled();
  });

  it('resumes reacting to resize once the field blurs', () => {
    const documentStub: { activeElement: unknown } = {
      activeElement: { tagName: 'INPUT', type: 'text' },
    };
    vi.stubGlobal('document', documentStub);
    const onLayout = vi.fn();
    const { scaleState, scene, triggerResize } = fakeScene(1280, 720);
    new OrientationController(scene, { onLayout });
    onLayout.mockClear();

    scaleState.parentSize = { width: 1000, height: 600 };
    triggerResize();
    expect(onLayout).not.toHaveBeenCalled();

    documentStub.activeElement = null;
    scaleState.parentSize = { width: 900, height: 550 };
    triggerResize();
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it('treats a focused textarea and a contenteditable the same as a text input', () => {
    for (const activeElement of [
      { tagName: 'TEXTAREA' },
      { tagName: 'DIV', isContentEditable: true },
    ]) {
      vi.stubGlobal('document', { activeElement });
      const onLayout = vi.fn();
      const { scaleState, scene, triggerResize } = fakeScene(1280, 720);
      new OrientationController(scene, { onLayout });
      onLayout.mockClear();

      scaleState.parentSize = { width: 1000, height: 600 };
      triggerResize();

      expect(onLayout).not.toHaveBeenCalled();
    }
  });

  it('does not treat a focused non-text input (e.g. a checkbox) as text entry', () => {
    vi.stubGlobal('document', {
      activeElement: { tagName: 'INPUT', type: 'checkbox' },
    });
    const onLayout = vi.fn();
    const { scaleState, scene, triggerResize } = fakeScene(1280, 720);
    new OrientationController(scene, { onLayout });
    onLayout.mockClear();

    scaleState.parentSize = { width: 1000, height: 600 };
    triggerResize();

    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it('is safe with no document at all (plain unit-test environment)', () => {
    const onLayout = vi.fn();
    const { scaleState, scene, triggerResize } = fakeScene(1280, 720);
    expect(() => new OrientationController(scene, { onLayout })).not.toThrow();
    onLayout.mockClear();

    scaleState.parentSize = { width: 1000, height: 600 };
    expect(() => triggerResize()).not.toThrow();
    expect(onLayout).toHaveBeenCalledTimes(1);
  });
});
