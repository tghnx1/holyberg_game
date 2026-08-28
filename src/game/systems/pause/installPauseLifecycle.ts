import Phaser from 'phaser';
import { attachPauseControl } from './PauseControl';

/**
 * Installed once from main, mirroring `installFullscreenLifecycle`. Wires
 * every scene the game ever adds — present and future — to the pause
 * system without this module ever naming one: it walks the SceneManager's
 * own scene list and re-attaches the pause control each time a scene
 * finishes creating, which also covers RESTART re-entering the same scene.
 *
 * Deferred to the game's READY event rather than run inline. `new
 * Phaser.Game(config)` does not instantiate the configured scenes: the
 * SceneManager constructor parks them in its private `_pending` list and
 * registers its own `bootQueue` on READY, and only `bootQueue` populates
 * `game.scene.scenes`. Since main calls this immediately after constructing
 * the game — long before DOMContentLoaded lets `boot()` run — iterating
 * `scenes` inline walked an empty array and silently attached nothing at
 * all, on every platform. The SceneManager registers its READY listener in
 * its constructor, i.e. before this one, and emitters fire in registration
 * order, so by the time `watch` runs `scenes` is fully populated.
 */
export function installPauseLifecycle(game: Phaser.Game): void {
  const watch = (): void => {
    for (const scene of game.scene.scenes) {
      scene.sys.events.on(Phaser.Scenes.Events.CREATE, () => attachPauseControl(scene));
      // bootQueue starts the first scene synchronously, before any listener
      // registered after the SceneManager's own gets its turn, so that
      // scene's create() may already have fired. Without this it would wait
      // for a restart to get its controls.
      if (scene.sys.isActive()) attachPauseControl(scene);
    }
  };

  if (game.scene.isBooted) watch();
  else game.events.once(Phaser.Core.Events.READY, watch);
}
