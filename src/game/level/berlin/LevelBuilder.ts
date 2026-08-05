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
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {}

  build(): BuiltBerlinLevel {
    const factory = new PlaceholderFactory(this.scene, this.layer);
    const collectibles = this.scene.physics.add.staticGroup();
    const finish = this.scene.physics.add.staticGroup();
    const platforms = this.scene.physics.add.staticGroup();
    const movingPlatforms: Phaser.GameObjects.Zone[] = [];
    const pendingActivations: PendingActivation[] = [];
    const entities = BERLIN_ENTITIES.map((config) => {
      const artwork = factory.create(config);
      const hitbox = 'hitbox' in config ? config.hitbox : undefined;
      const zone = this.createZone(config, hitbox);
      zone.setData('config', config).setData('artwork', artwork).setData('id', config.id);
      if (config.type === 'obstacle') {
        zone.setData('alreadyHit', false);
        this.validateObstacle(config);
        this.configureMovement(config, zone, artwork);
      } else if (config.type === 'collectible') {
        collectibles.add(zone);
      } else if (config.type === 'platform') {
        this.validatePlatform(config);
        platforms.add(zone);
      } else if (config.type === 'movingPlatform') {
        this.validatePlatform(config);
        movingPlatforms.push(zone);
        const pending = this.configureMovingPlatform(config, zone, artwork);
        if (pending) pendingActivations.push(pending);
      } else {
        finish.add(zone);
      }
      return { config, artwork, zone };
    });
    return { collectibles, finish, platforms, movingPlatforms, pendingActivations, entities };
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
