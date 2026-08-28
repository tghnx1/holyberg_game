import Phaser from 'phaser';
import { attachPauseControl } from './PauseControl';

/**
 * Installed once from main, mirroring `installFullscreenLifecycle`. Wires
 * every scene the game ever adds — present and future — to the pause
 * system without this module ever naming one: it just walks the
 * SceneManager's own scene list (already populated for every scene in
 * `config.scene` by the time the game finishes constructing) and
 * re-attaches the pause control each time a scene finishes creating, which
 * also covers RESTART re-entering the same scene.
 *
 * Hooked to CREATE, not START: START fires before the scene's own create()
 * has run, while the ScaleManager's EXPAND viewport hasn't necessarily
 * settled yet, so a button placed then could end up positioned for a stale
 * (often desktop-default) size and never get nudged into view again unless
 * a later RESIZE happened to fire — which is why the buttons could go
 * missing specifically on desktop. CREATE always runs after `scene.add` and
 * `this.cameras.main` are ready, matching how every other scene attaches its
 * own UI (e.g. `attachFullscreenExitControl`, called from inside create()).
 */
export function installPauseLifecycle(game: Phaser.Game): void {
  for (const scene of game.scene.scenes) {
    scene.sys.events.on(Phaser.Scenes.Events.CREATE, () => attachPauseControl(scene));
  }
}
