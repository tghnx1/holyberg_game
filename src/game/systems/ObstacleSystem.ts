import Phaser from 'phaser';
import { Depth } from '../constants';
import { OBSTACLES } from '../level/berlinLevel';

export class ObstacleSystem {
  readonly zones: Phaser.Physics.Arcade.StaticGroup;

  constructor(scene: Phaser.Scene, gameplayLayer: Phaser.GameObjects.Layer) {
    this.zones = scene.physics.add.staticGroup();
    const colors = {
      barrier: 0xf05b35,
      scooter: 0x7cd4ce,
      bag: 0x433849,
      car: 0x884978,
      'night-creature': 0x3c244f,
    };

    for (const obstacle of OBSTACLES) {
      const artwork = scene.add
        .rectangle(
          obstacle.x,
          obstacle.y,
          obstacle.width,
          obstacle.height,
          colors[obstacle.kind],
        )
        .setDepth(Depth.GAMEPLAY)
        .setScrollFactor(1)
        .setStrokeStyle(4, 0x14101e);
      const label = scene.add
        .text(
          obstacle.x,
          obstacle.y,
          obstacle.kind === 'night-creature'
            ? 'NIGHT\nCREATURE'
            : obstacle.kind.toUpperCase(),
          {
            fontFamily: 'Space Mono',
            fontSize: '11px',
            color: '#fff',
            align: 'center',
          },
        )
        .setOrigin(0.5)
        .setDepth(Depth.GAMEPLAY)
        .setScrollFactor(1);
      gameplayLayer.add([artwork, label]);

      const hitbox = scene.add.zone(
        obstacle.x,
        obstacle.y,
        obstacle.width * 0.75,
        obstacle.height * 0.8,
      );
      scene.physics.add.existing(hitbox, true);
      this.zones.add(hitbox);
    }
  }
}
