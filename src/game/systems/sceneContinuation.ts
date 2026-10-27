import type Phaser from 'phaser';

/** Keeps an asynchronous transition in its originating run, waiting out pauses. */
export function createSceneContinuation(scene: Phaser.Scene): {
  ready: () => Promise<boolean>;
  dispose: () => void;
} {
  let stopped = false;
  let settle: ((ready: boolean) => void) | undefined;
  const onShutdown = (): void => {
    stopped = true;
    settle?.(false);
  };
  const onResume = (): void => {
    if (!scene.scene.isPaused()) settle?.(!stopped);
  };
  scene.events.once('shutdown', onShutdown);
  return {
    ready: () => {
      if (stopped) return Promise.resolve(false);
      if (!scene.scene.isPaused()) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        settle = resolve;
        scene.events.on('resume', onResume);
      });
    },
    dispose: () => {
      scene.events.off('shutdown', onShutdown);
      scene.events.off('resume', onResume);
      settle = undefined;
    },
  };
}
