import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {
  Scale: { Events: { ENTER_FULLSCREEN: 'enter', LEAVE_FULLSCREEN: 'leave' } },
  Core: { Events: { READY: 'ready' } },
} }));

import { releaseKeyboardResizeGuard, setupFullscreenResize } from '../src/game/responsive/FullscreenResize';

class Emitter {
  private listeners = new Map<string, (() => void)[]>();
  on(event: string, listener: () => void): void { this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]); }
  once(event: string, listener: () => void): void { this.on(event, listener); }
  addEventListener(event: string, listener: () => void): void { this.on(event, listener); }
  emit(event: string, payload?: unknown): void { for (const listener of this.listeners.get(event) ?? []) (listener as (event?: unknown) => void)(payload); }
}

function setup() {
  vi.useFakeTimers();
  const documentEmitter = new Emitter();
  const visual = Object.assign(new Emitter(), { height: 390, offsetTop: 0 });
  const style: Record<string, unknown> = { removeProperty: (key: string) => delete style[key] };
  const host = {
    style,
    clientWidth: 844,
    clientHeight: 390,
    contains: (element: unknown) => element === input,
    getBoundingClientRect: () => ({ width: 844, height: 390 }),
  };
  const input = { tagName: 'INPUT', type: 'text' };
  const active = { value: null as unknown };
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  vi.stubGlobal('document', Object.assign(documentEmitter, {
    activeElement: active.value,
    getElementById: () => host,
  }));
  vi.stubGlobal('window', Object.assign(new Emitter(), {
    innerWidth: 844, innerHeight: 390, visualViewport: visual,
  }));
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/128 Mobile Safari/604.1' });
  const frames: (() => void)[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { frames.push(callback); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const camera = { setSize: vi.fn() };
  const scale = Object.assign(new Emitter(), {
    isFullscreen: false,
    gameSize: { width: 844 / 390 * 720, height: 720 },
    setParentSize: vi.fn((width: number, height: number) => { scale.gameSize = { width: width / height * 720, height: 720 }; }),
  });
  const game = { scale, events: new Emitter(), scene: { getScenes: () => [{ cameras: { main: camera } }] } };
  setupFullscreenResize(game as never);
  game.events.emit('ready');
  vi.runAllTimers();
  scale.setParentSize.mockClear();
  camera.setSize.mockClear();
  return { documentEmitter, visual, active, input, game, camera, frames, originalDocument, originalWindow };
}

describe('FullscreenResize keyboard guard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps Phaser dimensions unchanged through repeated visualViewport keyboard events', () => {
    const h = setup();
    h.active.value = h.input;
    (globalThis.document as unknown as { activeElement: unknown }).activeElement = h.input;
    h.documentEmitter.emit('focusin', { target: h.input });
    for (const height of [180, 160, 180]) {
      h.visual.height = height;
      h.visual.emit('resize');
      h.visual.emit('scroll');
    }
    expect(h.game.scale.setParentSize).not.toHaveBeenCalled();
    expect(h.camera.setSize).not.toHaveBeenCalled();
  });

  it('applies exactly one deferred viewport update after blur', () => {
    const h = setup();
    h.active.value = h.input;
    (globalThis.document as unknown as { activeElement: unknown }).activeElement = h.input;
    h.documentEmitter.emit('focusin', { target: h.input });
    h.visual.height = 180;
    h.visual.emit('resize');
    h.active.value = null;
    (globalThis.document as unknown as { activeElement: unknown }).activeElement = null;
    h.visual.height = 380;
    h.documentEmitter.emit('focusout', { target: h.input });
    vi.advanceTimersByTime(200);
    expect(h.game.scale.setParentSize).toHaveBeenCalledTimes(1);
    expect(h.camera.setSize).toHaveBeenCalledTimes(1);
  });

  it('waits for the final stable keyboard-close height', () => {
    const h = setup();
    h.visual.height = 400;
    h.visual.emit('resize');
    vi.advanceTimersByTime(200);
    h.game.scale.setParentSize.mockClear();
    h.camera.setSize.mockClear();
    h.active.value = h.input;
    (globalThis.document as unknown as { activeElement: unknown }).activeElement = h.input;
    h.documentEmitter.emit('focusin', { target: h.input });
    for (const height of [180, 240, 320, 390]) {
      h.visual.height = height;
      h.visual.emit('resize');
      h.visual.emit('scroll');
      vi.advanceTimersByTime(200);
      expect(h.game.scale.setParentSize).not.toHaveBeenCalled();
    }
    h.active.value = null;
    (globalThis.document as unknown as { activeElement: unknown }).activeElement = null;
    releaseKeyboardResizeGuard();
    vi.advanceTimersByTime(200);
    expect(h.game.scale.setParentSize).toHaveBeenCalledTimes(1);
    expect(h.game.scale.setParentSize).toHaveBeenLastCalledWith(844, 390);
  });

  it('releases safely when the still-focused input is removed on submit or cancel', () => {
    const h = setup();
    h.active.value = h.input;
    (globalThis.document as unknown as { activeElement: unknown }).activeElement = h.input;
    h.documentEmitter.emit('focusin', { target: h.input });
    releaseKeyboardResizeGuard();
    (globalThis.document as unknown as { activeElement: unknown }).activeElement = null;
    h.visual.height = 380;
    h.visual.emit('resize');
    vi.advanceTimersByTime(200);
    expect(h.game.scale.setParentSize).toHaveBeenCalledTimes(1);
  });
});
