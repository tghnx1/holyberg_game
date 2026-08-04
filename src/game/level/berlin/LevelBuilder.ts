import Phaser from 'phaser';
import { GROUND_Y } from '../../constants';
import { CROUCHING_BODY, STANDING_BODY } from './playerPhysics';
import { BERLIN_ENTITIES } from './berlinLevelConfig';
import { PlaceholderFactory } from './PlaceholderFactory';
import type { BerlinEntity, CollectibleConfig, ObstacleConfig } from './types';

export interface BuiltEntity {
  config: BerlinEntity;
  artwork: Phaser.GameObjects.Container;
  zone: Phaser.GameObjects.Zone;
}

export interface BuiltBerlinLevel {
  obstacles: Phaser.Physics.Arcade.Group;
  collectibles: Phaser.Physics.Arcade.StaticGroup;
  finish: Phaser.Physics.Arcade.StaticGroup;
  entities: BuiltEntity[];
}

export class LevelBuilder {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {}

  build(): BuiltBerlinLevel {
    const factory = new PlaceholderFactory(this.scene, this.layer);
    const obstacles = this.scene.physics.add.group();
    const collectibles = this.scene.physics.add.staticGroup();
    const finish = this.scene.physics.add.staticGroup();
    const entities = BERLIN_ENTITIES.map((config) => {
      const artwork = factory.create(config);
      const hitbox = 'hitbox' in config ? config.hitbox : undefined;
      const zone = this.scene.add.zone(
        hitbox ? config.x + hitbox.offsetX : config.x,
        hitbox ? config.y + hitbox.offsetY : config.y,
        hitbox ? hitbox.width : config.width * 0.78,
        hitbox ? hitbox.height : config.height * 0.82,
      );
      this.scene.physics.add.existing(zone, config.type !== 'obstacle');
      if (config.type === 'obstacle') {
        const body = zone.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false).setImmovable(true);
        this.validateObstacle(config);
      }
      zone.setData('config', config).setData('artwork', artwork).setData('id', config.id);
      if (config.type === 'obstacle') {
        obstacles.add(zone);
        this.configureMovement(config, zone, artwork);
      } else if (config.type === 'collectible') collectibles.add(zone);
      else finish.add(zone);
      return { config, artwork, zone };
    });
    return { obstacles, collectibles, finish, entities };
  }

  private validateObstacle(config: ObstacleConfig): void {
    const zoneTop = config.y + config.hitbox.offsetY - config.hitbox.height / 2;
    const zoneBottom = zoneTop + config.hitbox.height;
    const standingTop = GROUND_Y - STANDING_BODY.height;
    const crouchingTop = GROUND_Y - CROUCHING_BODY.height;
    if (config.action === 'duck') {
      if (!(standingTop < zoneBottom && crouchingTop > zoneBottom)) {
        throw new Error(`Invalid duck obstacle hitbox for ${config.id}`);
      }
      return;
    }
    const hitboxBottom = config.y + config.hitbox.offsetY + config.hitbox.height / 2;
    if (Math.abs(hitboxBottom - GROUND_Y) > 0.01) {
      throw new Error(`Jump obstacle ${config.id} must sit on the ground baseline`);
    }
    if (zoneTop > GROUND_Y) throw new Error(`Jump obstacle ${config.id} is below ground`);
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
}

export function isCollectible(config: BerlinEntity): config is CollectibleConfig {
  return config.type === 'collectible';
}
