import Phaser from 'phaser';
import type { BuiltEntity } from '../level/berlin/LevelBuilder';

/**
 * How far past each camera edge an object stays visible. Generous enough that
 * nothing can pop in while it is on screen, including objects whose tween
 * carries them toward the view.
 */
const VISIBLE_BUFFER = 600;
/**
 * Bodies come back before the artwork does, so an entity is always collidable
 * for a while before it can be seen. Never smaller than VISIBLE_BUFFER.
 */
const BODY_BUFFER = 900;

interface CullTarget {
  artwork: Phaser.GameObjects.Container;
  zone: Phaser.GameObjects.Zone;
  /** Half the authored art width, so the test uses the object's real extent. */
  halfWidth: number;
  visible: boolean;
  bodyEnabled: boolean;
  /**
   * What `body.enable` was when we switched it off. A hit obstacle disables
   * its own body permanently, and re-entering the view must not revive it.
   */
  restoreBodyTo: boolean;
  removed: boolean;
}

/**
 * Hides and de-physics gameplay entities that are far off screen.
 *
 * Only objects LevelBuilder created are considered: the player, the HUD, the
 * sky and the full-width parallax layers are never touched. Tweens keep
 * running while an object is culled, so a moving platform carries on along
 * its path and simply reappears where it should be; its body is resynced to
 * the object's position on the way back in.
 */
export class CullingSystem {
  private readonly targets: CullTarget[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  /** Registers an entity. Safe to call again for objects added at runtime. */
  track(entity: BuiltEntity): void {
    const target: CullTarget = {
      artwork: entity.artwork,
      zone: entity.zone,
      halfWidth: entity.config.width / 2,
      visible: true,
      bodyEnabled: true,
      restoreBodyTo: true,
      removed: false,
    };
    // Collected pickups and editor deletions destroy the zone; drop the entry
    // rather than touching a dead object every frame.
    entity.zone.once(Phaser.GameObjects.Events.DESTROY, () => {
      target.removed = true;
    });
    this.targets.push(target);
  }

  trackAll(entities: readonly BuiltEntity[]): void {
    for (const entity of entities) this.track(entity);
  }

  /** Stops tracking an entity without waiting for its destroy event. */
  release(zone: Phaser.GameObjects.Zone): void {
    for (const target of this.targets) {
      if (target.zone === zone) target.removed = true;
    }
  }

  update(): void {
    const camera = this.scene.cameras.main;
    const left = camera.scrollX;
    const right = left + camera.width;

    // Indexed loop and no closures: this runs for every entity every frame.
    for (let index = 0; index < this.targets.length; index += 1) {
      const target = this.targets[index];
      if (target.removed) continue;

      const x = target.zone.x;
      const half = target.halfWidth;
      const nearRight = x - half;
      const nearLeft = x + half;

      const shouldSee = nearLeft >= left - VISIBLE_BUFFER && nearRight <= right + VISIBLE_BUFFER;
      const shouldCollide = nearLeft >= left - BODY_BUFFER && nearRight <= right + BODY_BUFFER;

      if (shouldSee !== target.visible) this.setVisible(target, shouldSee);
      if (shouldCollide !== target.bodyEnabled) this.setBodyEnabled(target, shouldCollide);
    }
  }

  private setVisible(target: CullTarget, visible: boolean): void {
    target.visible = visible;
    target.artwork.setVisible(visible).setActive(visible);
    target.zone.setActive(visible);
  }

  private setBodyEnabled(target: CullTarget, enabled: boolean): void {
    target.bodyEnabled = enabled;
    const body = target.zone.body as
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | null;
    if (!body) return;

    if (!enabled) {
      // Remember the gameplay-driven state so a spent obstacle stays spent.
      target.restoreBodyTo = body.enable;
      body.enable = false;
      return;
    }

    // A tween may have moved the object while its body was asleep, so put the
    // body back where the object actually is before switching it on.
    if (body instanceof Phaser.Physics.Arcade.StaticBody) {
      body.updateFromGameObject();
    } else {
      body.reset(target.zone.x, target.zone.y);
    }
    body.enable = target.restoreBodyTo;
  }

  /** Puts every object back to normal, e.g. before leaving the scene. */
  restoreAll(): void {
    for (const target of this.targets) {
      if (target.removed) continue;
      if (!target.visible) this.setVisible(target, true);
      if (!target.bodyEnabled) this.setBodyEnabled(target, true);
    }
  }

  destroy(): void {
    this.targets.length = 0;
  }
}
