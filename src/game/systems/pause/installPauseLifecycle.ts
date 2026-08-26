import Phaser from 'phaser';
import { attachPauseControl } from './PauseControl';

/**
 * Installed once from main, mirroring `installFullscreenLifecycle`. Wires
 * every scene the game ever adds — present and future — to the pause
 * system without this module ever naming one: it just walks the
 * SceneManager's own scene list (already populated for every scene in
 * `config.scene` by the time the game finishes constructing) and
 * re-attaches the pause control each time a scene (re)starts, which also
 * covers RESTART re-entering the same scene.
 */
export function installPauseLifecycle(game: Phaser.Game): void {
  for (const scene of game.scene.scenes) {
    scene.sys.events.on(Phaser.Scenes.Events.START, () => attachPauseControl(scene));
  }
}
