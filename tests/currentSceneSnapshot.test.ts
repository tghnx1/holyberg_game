import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchCurrentSceneDialogue } from '../src/game/dialogue/currentSceneSnapshot';

class FakeImageElement {}

afterEach(() => vi.unstubAllGlobals());

describe('launchCurrentSceneDialogue', () => {
  it('moves DialogueScene above the paused source after the queued launch creates it', async () => {
    vi.stubGlobal('HTMLImageElement', FakeImageElement);
    const calls: string[] = [];
    let onDialogueCreate: (() => void) | undefined;
    const scene = {
      game: {
        renderer: {
          snapshot: (callback: (image: FakeImageElement) => void) =>
            callback(new FakeImageElement()),
        },
      },
      textures: {
        remove: vi.fn(),
        addImage: vi.fn(() => ({})),
      },
      cameras: { main: { width: 1280, height: 720 } },
      scene: {
        key: 'ClubScene',
        get: vi.fn(() => ({
          events: {
            once: (event: string, callback: () => void) => {
              expect(event).toBe('create');
              onDialogueCreate = callback;
            },
          },
        })),
        pause: vi.fn(() => calls.push('pause')),
        launch: vi.fn(() => calls.push('launch')),
        bringToTop: vi.fn(() => calls.push('bringToTop')),
      },
    };

    await launchCurrentSceneDialogue(scene as never, {
      script: { id: 'club-test' } as never,
      resumeEvent: 'done',
    });

    expect(calls).toEqual(['pause', 'launch']);
    onDialogueCreate?.();
    expect(calls).toEqual(['pause', 'launch', 'bringToTop']);
    expect(scene.scene.bringToTop).toHaveBeenCalledWith('DialogueScene');
  });
});
