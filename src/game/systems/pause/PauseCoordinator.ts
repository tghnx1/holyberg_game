import type Phaser from 'phaser';
import type { PausableScene } from './PausableScene';

export const PAUSE_SCENE_KEY = 'PauseScene';

export interface PauseSceneData {
  /** Key of the scene that was frozen; RESUME/RESTART act on this. */
  targetKey: string;
  /** The exact data the target scene was last started/restarted with. */
  entryData: unknown;
}

/**
 * Key of the currently paused scene, if any. A module-level singleton (not a
 * class) because there is only ever one game running one active pause at a
 * time, and every scene needs to reach the same instance without threading a
 * reference through the whole scene graph.
 */
let pausedSceneKey: string | undefined;

export function isPaused(): boolean {
  return pausedSceneKey !== undefined;
}

/**
 * Freezes `scene` completely (physics, timers, tweens, gameplay, dialogue
 * progression all ride on Phaser's own scene update loop, so pausing that
 * loop is enough) and launches the pause overlay on top of it. A no-op if
 * something is already paused, so a second ESC/tap while the menu is open
 * can't stack another pause underneath it.
 */
export function requestPause(scene: Phaser.Scene): void {
  if (isPaused()) return;
  const key = scene.scene.key;
  pausedSceneKey = key;
  (scene as Partial<PausableScene>).onGamePause?.();
  scene.scene.pause(key);
  scene.scene.launch(PAUSE_SCENE_KEY, {
    targetKey: key,
    entryData: scene.scene.settings.data,
  } satisfies PauseSceneData);
}

/** Resumes the paused scene exactly where it stopped and closes the overlay. */
export function resumeFromPause(pauseScene: Phaser.Scene): void {
  const key = pausedSceneKey;
  if (!key) return;
  pausedSceneKey = undefined;
  pauseScene.scene.stop(PAUSE_SCENE_KEY);
  const target = pauseScene.scene.get(key);
  (target as Partial<PausableScene>).onGameResume?.();
  pauseScene.scene.resume(key);
}

/** Restarts the paused scene with the same entry data it was originally started with. */
export function restartFromPause(pauseScene: Phaser.Scene): void {
  const key = pausedSceneKey;
  if (!key) return;
  pausedSceneKey = undefined;
  pauseScene.scene.stop(PAUSE_SCENE_KEY);
  const target = pauseScene.scene.get(key);
  const entryData = target.scene.settings.data;
  pauseScene.scene.stop(key);
  pauseScene.scene.start(key, entryData);
}

/** Test-only: clears module state between cases. */
export function __resetPauseStateForTests(): void {
  pausedSceneKey = undefined;
}
