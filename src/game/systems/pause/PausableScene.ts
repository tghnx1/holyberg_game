/**
 * Optional hooks a scene can implement to react to the global pause system.
 * Nothing here is required: a scene that owns only Phaser-native tweens,
 * timers and physics is already fully frozen by `scene.scene.pause()`. Only
 * a scene driving something outside Phaser's own loop — raw Web Audio, in
 * `RhythmScene` — needs to implement these.
 */
export interface PausableScene {
  onGamePause?(): void;
  onGameResume?(): void;
}

/**
 * Opt-out flag for scenes that should never show the pause control: menus,
 * results and transition screens. Pausable is the default, so a brand new
 * gameplay/dialogue scene needs no changes at all to inherit pause support —
 * only screens that must NOT be pausable set `static pausable = false`.
 */
export interface PauseOptOutScene {
  pausable?: boolean;
}

export function isPausable(scene: Phaser.Scene): boolean {
  const ctor = scene.constructor as unknown as PauseOptOutScene;
  return ctor.pausable !== false;
}
