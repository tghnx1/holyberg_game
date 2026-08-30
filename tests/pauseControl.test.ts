import type Phaser from 'phaser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetSceneEditorStateForTests, setSceneEditorActive } from '../src/game/systems/sceneEditorState';

vi.mock('phaser', () => ({
  default: {
    Input: { Events: { POINTER_DOWN: 'pointerdown' } },
    Scale: { Events: { RESIZE: 'resize' } },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
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
  const button = createText();
  const scene = {
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
      once: vi.fn(),
    },
  };
  return { scene, keyboardListeners };
}

describe('pause control keyboard shortcuts', () => {
  beforeEach(() => {
    vi.mocked(requestPause).mockClear();
    __resetSceneEditorStateForTests();
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
});
