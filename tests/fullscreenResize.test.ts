import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {
  Scale: { Events: { ENTER_FULLSCREEN: 'enterfullscreen', LEAVE_FULLSCREEN: 'leavefullscreen' } },
  Core: { Events: { READY: 'ready' } },
} }));
import { setupFullscreenResize } from '../src/game/responsive/FullscreenResize';

class Emitter {
  handlers = new Map<string, (() => void)[]>();
  on(event: string, callback: () => void) {
    this.handlers.set(event, [...this.handlers.get(event) ?? [], callback]);
  }
  once(event: string, callback: () => void) { this.on(event, callback); }
  addEventListener(event: string, callback: () => void) { this.on(event, callback); }
  emit(event: string) { this.handlers.get(event)?.forEach((callback) => callback()); }
}

describe('iOS Chrome viewport recovery around replay', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('restores the host, canvas logical size and active camera after keyboard/browser changes', () => {
    const visual = Object.assign(new Emitter(), { height: 390, offsetTop: 0 });
    const browser = Object.assign(new Emitter(), { innerWidth: 844, innerHeight: 390, visualViewport: visual });
    const style: Record<string, unknown> = { removeProperty(key: string) { delete style[key]; } };
    const host = {
      style, clientWidth: 844, clientHeight: 390,
      getBoundingClientRect: () => ({ width: 844, height: parseFloat(String(style.height ?? '390')) }),
    };
    vi.stubGlobal('document', { getElementById: () => host });
    vi.stubGlobal('window', browser);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/128.0 Mobile/15E148 Safari/604.1' });
    const nextFrame: (() => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => nextFrame.push(callback));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const camera = { setSize: vi.fn() };
    const events = new Emitter();
    const scale = Object.assign(new Emitter(), {
      isFullscreen: false,
      gameSize: { width: 720, height: 720 },
      setParentSize(width: number, height: number) {
        this.gameSize = { width: width / height * 720, height: 720 };
      },
    });
    const game = { scale, events, scene: { getScenes: () => [{ cameras: { main: camera } }] } };
    setupFullscreenResize(game as never);
    events.emit('ready');
    expect(host.getBoundingClientRect().height).toBe(390);

    // Entering a username in Results, closing the keyboard, then replaying
    // while Chrome's toolbar changes. No full page reload is involved.
    for (const [height, offsetTop, event] of [[180, 95, 'resize'], [330, 60, 'scroll'], [390, 0, 'resize']] as const) {
      visual.height = height;
      visual.offsetTop = offsetTop;
      visual.emit(event);
      nextFrame.splice(0).forEach((callback) => callback());
      expect(host.getBoundingClientRect().height).toBe(height);
      expect(style.top).toBe(`${offsetTop}px`);
      expect(camera.setSize).toHaveBeenLastCalledWith(844 / height * 720, 720);
    }
    expect(host.getBoundingClientRect().height).toBe(390);
    expect(style.top).toBe('0px');
  });
});
