import Phaser from 'phaser';
import { Depth } from '../../constants';
import { textureForSlot } from './ArtSlotRegistry';
import { getPlatformSupportLayout, getPlatformVisualLayout } from './platformVisualLayout';
import type { BerlinEntity } from './types';

const colors = {
  jump: 0xf36b45,
  duck: 0xf1b93a,
  moving: 0x9d60d5,
  platform: 0x59c1ff,
  movingPlatform: 0x2f8fd6,
  collectible: 0x4fd5c7,
} as const;

export class PlaceholderFactory {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {}

  create(entity: BerlinEntity): Phaser.GameObjects.Container {
    const platformLayout =
      entity.type === 'platform' || entity.type === 'movingPlatform'
        ? getPlatformVisualLayout(entity)
        : undefined;
    const texture = platformLayout?.textureKey ?? textureForSlot(this.scene, entity.artSlot);
    const color = entity.type === 'obstacle' ? colors[entity.action] : colors[entity.type];
    const body = platformLayout
      ? this.scene.add
          .image(platformLayout.imageX, platformLayout.imageY, platformLayout.textureKey)
          .setScale(platformLayout.scale)
      : texture
        ? this.scene.add.image(0, 0, texture).setDisplaySize(entity.width, entity.height)
      : this.scene.add
          .rectangle(0, 0, entity.width, entity.height, color)
          .setStrokeStyle(4, 0x17101f);
    const supports =
      platformLayout && (entity.type === 'platform' || entity.type === 'movingPlatform')
        ? getPlatformSupportLayout(entity, platformLayout).map((piece) =>
            this.scene.add
              .rectangle(piece.x, piece.y, piece.width, piece.height, piece.color, piece.alpha)
              .setRotation(piece.rotation ?? 0)
              .setStrokeStyle(1, 0x0d0912, 0.72),
          )
        : [];
    const children: Phaser.GameObjects.GameObject[] = [...supports, body];
    if (
      import.meta.env.DEV &&
      entity.type !== 'platform' &&
      entity.type !== 'movingPlatform'
    ) {
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
