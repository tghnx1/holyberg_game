import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { launchCurrentSceneDialogue } from '../src/game/dialogue/currentSceneSnapshot';

class FakeImageElement {}

afterEach(() => vi.unstubAllGlobals());

describe('launchCurrentSceneDialogue', () => {
  it('moves DialogueScene above the paused source after the queued launch creates it', async () => {
    vi.stubGlobal('HTMLImageElement', FakeImageElement);
    const calls: string[] = [];
    let onDialogueCreate: (() => void) | undefined;
    const scene = {
      events: new EventEmitter(),
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
        isPaused: () => false,
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

function deferredScene() {
  let callback: ((image: FakeImageElement) => void) | undefined;
  let paused = false;
  const scene = {
    events: new EventEmitter(),
    game: { renderer: { snapshot: (cb: typeof callback) => { callback = cb; } } },
    textures: { remove: vi.fn(), addImage: vi.fn(() => ({})), exists: () => true },
    cameras: { main: { width: 1280, height: 720 } },
    scene: {
      key: 'ClubScene', isPaused: () => paused,
      get: () => ({ events: new EventEmitter() }),
      pause: vi.fn(), launch: vi.fn(), bringToTop: vi.fn(),
    },
  };
  return {
    scene,
    capture: () => callback?.(new FakeImageElement()),
    pause: () => { paused = true; },
    resume: () => { paused = false; scene.events.emit('resume'); },
  };
}

const request = { script: { id: 'club-test' } as never, resumeEvent: 'done' };

describe('snapshot transition lifetime', () => {
  afterEach(() => vi.useRealTimers());

  it('waits for a pause during capture and launches exactly once after resume', async () => {
    vi.stubGlobal('HTMLImageElement', FakeImageElement);
    const fixture = deferredScene();
    const transition = launchCurrentSceneDialogue(fixture.scene as never, request);
    fixture.pause();
    fixture.capture();
    await Promise.resolve();
    expect(fixture.scene.scene.launch).not.toHaveBeenCalled();
    fixture.resume();
    await transition;
    expect(fixture.scene.scene.launch).toHaveBeenCalledTimes(1);
    expect(fixture.scene.events.listenerCount('resume')).toBe(0);
  });

  it('cancels shutdown capture and ignores its late callback after a new run', async () => {
    vi.stubGlobal('HTMLImageElement', FakeImageElement);
    const fixture = deferredScene();
    const transition = launchCurrentSceneDialogue(fixture.scene as never, request);
    fixture.scene.events.emit('shutdown');
    await transition;
    fixture.capture();
    expect(fixture.scene.textures.addImage).not.toHaveBeenCalled();
    expect(fixture.scene.scene.launch).not.toHaveBeenCalled();
    expect(fixture.scene.events.listenerCount('shutdown')).toBe(0);
  });

  it('releases a completed capture when the paused source shuts down', async () => {
    vi.stubGlobal('HTMLImageElement', FakeImageElement);
    const fixture = deferredScene();
    const transition = launchCurrentSceneDialogue(fixture.scene as never, request);
    fixture.pause();
    fixture.capture();
    await Promise.resolve();
    fixture.scene.textures.remove.mockClear();
    fixture.scene.events.emit('shutdown');
    await transition;
    expect(fixture.scene.textures.remove).toHaveBeenCalledTimes(1);
    expect(fixture.scene.scene.launch).not.toHaveBeenCalled();
  });

  it('rejects texture registration errors so the caller can release its transition lock', async () => {
    vi.stubGlobal('HTMLImageElement', FakeImageElement);
    const fixture = deferredScene();
    fixture.scene.textures.addImage.mockImplementation(() => { throw new Error('texture failed'); });
    const transition = launchCurrentSceneDialogue(fixture.scene as never, request);
    const rejection = expect(transition).rejects.toThrow('texture failed');
    fixture.capture();
    await rejection;
    expect(fixture.scene.scene.launch).not.toHaveBeenCalled();
  });

  it('fails a renderer that never returns instead of locking the scene forever', async () => {
    vi.useFakeTimers();
    const fixture = deferredScene();
    const transition = launchCurrentSceneDialogue(fixture.scene as never, request);
    const rejection = expect(transition).rejects.toThrow('Timed out capturing');
    await vi.advanceTimersByTimeAsync(5000);
    await rejection;
    expect(fixture.scene.scene.launch).not.toHaveBeenCalled();
    expect(fixture.scene.events.listenerCount('shutdown')).toBe(0);
  });
});
