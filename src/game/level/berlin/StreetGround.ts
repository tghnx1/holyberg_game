import Phaser from 'phaser';
import { GROUND_Y, WORLD_WIDTH } from '../../constants';
import { getStreetGroundPlacements } from './streetGroundLayout';

/**
 * Creates only the Berlin street artwork. The unchanged invisible Arcade
 * rectangles in BerlinScene remain the authoritative collision ground.
 */
export function createStreetGround(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Layer,
  depth: number,
): Phaser.GameObjects.Image[] {
  return getStreetGroundPlacements(WORLD_WIDTH, GROUND_Y).map((placement) => {
    const texture = scene.textures.get(placement.textureKey);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    const image = scene.add
      .image(placement.x, placement.topY, placement.textureKey)
      .setOrigin(0, 0)
      .setScrollFactor(1)
      .setDepth(depth)
      .setDisplaySize(placement.width, placement.height);
    layer.add(image);
    return image;
  });
}
