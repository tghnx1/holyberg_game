import Phaser from 'phaser';
import { DESIGN_HEIGHT, GROUND_Y } from '../../constants';
import { CROUCHING_BODY, STANDING_BODY } from './playerPhysics';
import { BERLIN_ENTITIES, CLUB_ENTRANCE_X } from './berlinLevelConfig';
import { PlaceholderFactory } from './PlaceholderFactory';
import type {
  BerlinEntity,
  CollectibleConfig,
  MovingPlatformConfig,
  ObstacleConfig,
  PlatformConfig,
} from './types';

export interface BuiltEntity {
  config: BerlinEntity;
  artwork: Phaser.GameObjects.Container;
  zone: Phaser.GameObjects.Zone;
}

export interface PendingActivation {
  activationX: number;
  activate: () => void;
}

export interface BuiltBerlinLevel {
  collectibles: Phaser.Physics.Arcade.StaticGroup;
  finish: Phaser.Physics.Arcade.StaticGroup;
  platforms: Phaser.Physics.Arcade.StaticGroup;
  movingPlatforms: Phaser.GameObjects.Zone[];
  pendingActivations: PendingActivation[];
  entities: BuiltEntity[];
}

export class LevelBuilder {
  private readonly factory: PlaceholderFactory;
  private readonly collectibles: Phaser.Physics.Arcade.StaticGroup;
  private readonly finish: Phaser.Physics.Arcade.StaticGroup;
  private readonly platforms: Phaser.Physics.Arcade.StaticGroup;
  private readonly movingPlatforms: Phaser.GameObjects.Zone[] = [];
  private readonly pendingActivations: PendingActivation[] = [];
  private readonly entities: BuiltEntity[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
  ) {
    this.factory = new PlaceholderFactory(scene, layer);
    this.collectibles = scene.physics.add.staticGroup();
    this.finish = scene.physics.add.staticGroup();
    this.platforms = scene.physics.add.staticGroup();
  }

  build(): BuiltBerlinLevel {
    BERLIN_ENTITIES.forEach((config) => this.addEntity(config));
    return {
      collectibles: this.collectibles,
      finish: this.finish,
      platforms: this.platforms,
      movingPlatforms: this.movingPlatforms,
      pendingActivations: this.pendingActivations,
      entities: this.entities,
    };
  }

  /**
   * Builds a single entity and registers it with the same groups and arrays
   * `build()` uses, so colliders already bound to those keep working. The dev
   * layout editor calls this when pasting a copied object.
   */
  addEntity(config: BerlinEntity): BuiltEntity {
    const artwork = this.factory.create(config);
    const hitbox = 'hitbox' in config ? config.hitbox : undefined;
    const zone = this.createZone(config, hitbox);
    zone.setData('config', config).setData('artwork', artwork).setData('id', config.id);
    if (config.type === 'obstacle') {
      zone.setData('alreadyHit', false);
      this.validateObstacle(config);
      this.configureMovement(config, zone, artwork);
    } else if (config.type === 'collectible') {
      this.collectibles.add(zone);
    } else if (config.type === 'platform') {
      this.validatePlatform(config);
      this.platforms.add(zone);
    } else if (config.type === 'movingPlatform') {
      this.validatePlatform(config);
      this.movingPlatforms.push(zone);
      const pending = this.configureMovingPlatform(config, zone, artwork);
      if (pending) this.pendingActivations.push(pending);
    } else {
      this.finish.add(zone);
    }
    const built = { config, artwork, zone };
    this.entities.push(built);
    return built;
  }

  /**
   * Tears an entity back out of every group, array and tween it was added to,
   * then destroys its artwork and zone. Used by the dev layout editor; any
   * pending activation for it is neutralised by the `zone.active` guard in
   * `configureMovingPlatform`.
   */
  removeEntity(zone: Phaser.GameObjects.Zone): void {
    const index = this.entities.findIndex((entity) => entity.zone === zone);
    if (index < 0) return;
    const [entity] = this.entities.splice(index, 1);

    this.collectibles.remove(zone);
    this.platforms.remove(zone);
    this.finish.remove(zone);
    const moving = this.movingPlatforms.indexOf(zone);
    if (moving >= 0) this.movingPlatforms.splice(moving, 1);

    this.scene.tweens.killTweensOf([zone, entity.artwork]);
    entity.artwork.destroy();
    zone.destroy();
  }

  private createZone(
    config: BerlinEntity,
    hitbox?: { offsetX: number; offsetY: number; width: number; height: number },
  ): Phaser.GameObjects.Zone {
    const isFinish = config.type === 'finish';
    const zone = this.scene.add.zone(
      isFinish
        ? CLUB_ENTRANCE_X + config.width / 2
        : hitbox
          ? config.x + hitbox.offsetX
          : config.x,
      isFinish ? DESIGN_HEIGHT / 2 : hitbox ? config.y + hitbox.offsetY : config.y,
      isFinish ? config.width : hitbox ? hitbox.width : config.width * 0.78,
      isFinish ? DESIGN_HEIGHT : hitbox ? hitbox.height : config.height * 0.82,
    );
    const isStatic = config.type === 'collectible' || config.type === 'finish' || config.type === 'platform';
    this.scene.physics.add.existing(zone, isStatic);
    const body = zone.body as
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | undefined;
    if (body) {
      body.enable = true;
      if (body instanceof Phaser.Physics.Arcade.Body) {
        body.setAllowGravity(false);
        body.setImmovable(true);
      } else {
        body.immovable = true;
      }
    }
    return zone;
  }

  private validateObstacle(config: ObstacleConfig): void {
    const zoneTop = config.y + config.hitbox.offsetY - config.hitbox.height / 2;
    const zoneBottom = zoneTop + config.hitbox.height;
    const standingTop = GROUND_Y - STANDING_BODY.height;
    const crouchingTop = GROUND_Y - CROUCHING_BODY.height;
    if (config.action === 'duck') {
      if (!(standingTop < zoneBottom && crouchingTop > zoneBottom)) {
        this.logValidationError(`Invalid duck obstacle hitbox for ${config.id}`);
      }
      return;
    }
    const hitboxBottom = config.y + config.hitbox.offsetY + config.hitbox.height / 2;
    if (Math.abs(hitboxBottom - GROUND_Y) > 0.01) {
      this.logValidationError(`Invalid jump obstacle hitbox for ${config.id}`);
    }
    if (zoneTop > GROUND_Y) this.logValidationError(`Invalid jump obstacle placement for ${config.id}`);
  }

  private validatePlatform(config: PlatformConfig | MovingPlatformConfig): void {
    if (config.topY <= 0 || config.width <= 0 || config.height <= 0) {
      this.logValidationError(`Invalid platform config for ${config.id}`);
    }
  }

  private logValidationError(message: string): void {
    if (import.meta.env.DEV) console.error(message);
  }

  private configureMovement(
    config: ObstacleConfig,
    zone: Phaser.GameObjects.Zone,
    artwork: Phaser.GameObjects.Container,
  ): void {
    if (!config.movement) return;
    this.scene.tweens.add({
      targets: [zone, artwork],
      x: config.x + config.movement.distance,
      duration: config.movement.durationMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private configureMovingPlatform(
    config: MovingPlatformConfig,
    zone: Phaser.GameObjects.Zone,
    artwork: Phaser.GameObjects.Container,
  ): PendingActivation | undefined {
    const half = config.movementDistance / 2;
    const reverse = config.reverseInitialDirection === true;

    const startTween = (): void => {
      // The editor can delete a platform before its activation x is reached.
      if (!zone.active) return;
      if (config.axis === 'horizontal') {
        this.scene.tweens.add({
          targets: [zone, artwork],
          x: reverse ? config.x - half : config.x + half,
          duration: config.durationMs,
          delay: config.phaseMs,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
      } else {
        this.scene.tweens.add({
          targets: [zone, artwork],
          y: reverse ? config.y - half : config.y + half,
          duration: config.durationMs,
          delay: config.phaseMs,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
      }
    };

    // Park the platform at whichever extreme the first tween leg starts from,
    // so artwork and body always begin in sync regardless of activation mode.
    if (config.axis === 'horizontal') {
      const startX = reverse ? config.x + half : config.x - half;
      zone.x = startX;
      artwork.x = startX;
    } else {
      const startY = reverse ? config.y + half : config.y - half;
      zone.y = startY;
      artwork.y = startY;
    }

    if (config.activationX !== undefined) {
      return { activationX: config.activationX, activate: startTween };
    }
    startTween();
    return undefined;
  }
}

export function isCollectible(config: BerlinEntity): config is CollectibleConfig {
  return config.type === 'collectible';
}
