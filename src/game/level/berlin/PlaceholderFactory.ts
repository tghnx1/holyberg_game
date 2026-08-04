import Phaser from 'phaser';
import { Depth } from '../../constants';
import { textureForSlot } from './ArtSlotRegistry';
import type { BerlinEntity } from './types';

const colors = {
  jump: 0xf36b45,
  duck: 0xf1b93a,
  moving: 0x9d60d5,
  collectible: 0x4fd5c7,
  finish: 0xff3f73,
} as const;

export class PlaceholderFactory {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {}

  create(entity: BerlinEntity): Phaser.GameObjects.Container {
    const texture = textureForSlot(this.scene, entity.artSlot);
    const color = entity.type === 'obstacle' ? colors[entity.action] : colors[entity.type];
    const body = texture
      ? this.scene.add.image(0, 0, texture).setDisplaySize(entity.width, entity.height)
      : this.scene.add
          .rectangle(0, 0, entity.width, entity.height, color)
          .setStrokeStyle(4, 0x17101f);
    const children: Phaser.GameObjects.GameObject[] = [body];
    if (import.meta.env.DEV) {
      const debugType = entity.type === 'obstacle' ? entity.action.toUpperCase() : entity.label;
      children.push(
        this.scene.add
          .text(0, 0, debugType, {
            fontFamily: 'Space Mono',
            fontSize: '11px',
            color: '#fff',
            align: 'center',
            backgroundColor: '#17101fcc',
            padding: { x: 4, y: 2 },
          })
          .setOrigin(0.5),
      );
    }
    const container = this.scene.add
      .container(entity.x, entity.y, children)
      .setDepth(entity.type === 'collectible' ? Depth.COLLECTIBLES : Depth.GAMEPLAY)
      .setScrollFactor(1);
    this.layer.add(container);
    return container;
  }
}
