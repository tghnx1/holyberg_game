import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createSceneContinuation } from '../src/game/systems/sceneContinuation';

function harness(paused = false) {
  const events = new EventEmitter();
  const scene = { events, scene: { isPaused: () => paused } };
  return {
    scene,
    resume: () => { paused = false; events.emit('resume'); },
  };
}

describe('asynchronous scene transitions', () => {
  it('waits for resume instead of dropping a result completed while paused', async () => {
    const { scene, resume } = harness(true);
    const continuation = createSceneContinuation(scene as never);
    let result: boolean | undefined;
    const pending = continuation.ready().then((ready) => { result = ready; });
    await Promise.resolve();
    expect(result).toBeUndefined();

    resume();
    await pending;

    expect(result).toBe(true);
    continuation.dispose();
    expect(scene.events.eventNames()).toEqual([]);
  });

  it('rejects a stale continuation after the scene shuts down and restarts', async () => {
    const { scene } = harness();
    const continuation = createSceneContinuation(scene as never);
    scene.events.emit('shutdown');

    expect(await continuation.ready()).toBe(false);
    continuation.dispose();
  });

  it('releases a pending pause wait when the scene is stopped', async () => {
    const { scene } = harness(true);
    const continuation = createSceneContinuation(scene as never);
    const pending = continuation.ready();

    scene.events.emit('shutdown');

    expect(await pending).toBe(false);
    continuation.dispose();
    expect(scene.events.eventNames()).toEqual([]);
  });
});
