import type Phaser from 'phaser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetSceneEditorStateForTests, setSceneEditorActive } from '../src/game/systems/sceneEditorState';
import { FullscreenExitReservedWidth } from '../src/game/responsive/FullscreenExitReservedWidth';

vi.mock('phaser', () => ({
  default: {
    Input: { Events: { POINTER_DOWN: 'pointerdown' } },
    Scale: { Events: { RESIZE: 'resize' } },
    Scenes: { Events: { SHUTDOWN: 'shutdown' }, SHUTDOWN: 8, DESTROYED: 9 },
  },
}));
vi.mock('../src/game/systems/pause/PauseCoordinator', () => ({
  isPaused: vi.fn(() => false),
  requestPause: vi.fn(),
}));

const { requestPause } = await import('../src/game/systems/pause/PauseCoordinator');
const { attachPauseControl } = await import('../src/game/systems/pause/PauseControl');

function createText() {
  return {
    x: 0,
    y: 0,
    displayWidth: 72,
    active: true,
    destroyed: false,
    scene: undefined as unknown,
    setOrigin: vi.fn().mockReturnThis(),
    setScrollFactor: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setStyle: vi.fn().mockReturnThis(),
    setPosition(x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    },
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

function createScene() {
  const keyboardListeners = new Map<string, (...args: unknown[]) => void>();
  const shutdownListeners: Array<() => void> = [];
  const button = createText();
  const scene = {
    sys: { settings: { status: 5 } },
    scale: {
      parentSize: { width: 1280, height: 720 },
      game: { device: { input: { touch: false } } },
      on: vi.fn(),
      off: vi.fn(),
    },
    cameras: { main: { width: 1280 } },
    add: {
      text: vi.fn(() => button),
    },
    input: {
      keyboard: {
        on: (event: string, callback: (...args: unknown[]) => void) => {
          keyboardListeners.set(event, callback);
        },
        off: (event: string) => {
          keyboardListeners.delete(event);
        },
      },
    },
    events: {
      once: vi.fn((event: string, listener: () => void) => {
        if (event === 'shutdown') shutdownListeners.push(listener);
      }),
    },
  };
  button.scene = scene;
  return { scene, keyboardListeners, shutdownListeners, button };
}

describe('pause control keyboard shortcuts', () => {
  beforeEach(() => {
    vi.mocked(requestPause).mockClear();
    __resetSceneEditorStateForTests();
    FullscreenExitReservedWidth.set(0);
  });

  it('pauses on P when the editor is closed', () => {
    const { scene, keyboardListeners } = createScene();
    attachPauseControl(scene as unknown as Phaser.Scene);

    keyboardListeners.get('keydown-P')?.({ key: 'P' });

    expect(requestPause).toHaveBeenCalledTimes(1);
    expect(requestPause).toHaveBeenCalledWith(scene);
  });

  it('keeps P inside the editor while ESC still pauses', () => {
    const { scene, keyboardListeners } = createScene();
    attachPauseControl(scene as unknown as Phaser.Scene);
    setSceneEditorActive(scene as unknown as Phaser.Scene, true);

    keyboardListeners.get('keydown-P')?.({ key: 'P' });
    expect(requestPause).not.toHaveBeenCalled();

    keyboardListeners.get('keydown-ESC')?.({ key: 'Escape' });
    expect(requestPause).toHaveBeenCalledTimes(1);
    expect(requestPause).toHaveBeenCalledWith(scene);
  });

  it('ignores a fullscreen reserved-width update once scene shutdown has started', () => {
    const { scene, button, shutdownListeners } = createScene();
    attachPauseControl(scene as unknown as Phaser.Scene);
    button.setStyle.mockClear();

    // Phaser marks the scene inactive before emitting SHUTDOWN listeners.
    // This simulates the fullscreen control publishing width=0 first, before
    // PauseControl has had a chance to unsubscribe its callback.
    scene.sys.settings.status = 8;
    FullscreenExitReservedWidth.set(64);
    expect(button.setStyle).not.toHaveBeenCalled();

    shutdownListeners.forEach((listener) => listener());
    FullscreenExitReservedWidth.set(0);
    expect(button.setStyle).not.toHaveBeenCalled();
  });
});
