import { COLLECTIBLE_ANIMATIONS } from './collectibleAnimations';
import { OBSTACLE_ANIMATIONS } from './obstacleAnimations';

const ANIM_KEY_BY_SLOT: Record<string, string> = Object.fromEntries(
  [...Object.values(OBSTACLE_ANIMATIONS), ...Object.values(COLLECTIBLE_ANIMATIONS)].map(
    (definition) => [definition.artSlot, definition.animKey],
  ),
);

export function textureForSlot(scene: Phaser.Scene, slot: string): string | undefined {
  return scene.textures.exists(slot) ? slot : undefined;
}

/** Looping animation key for an artSlot, if that slot has one registered and it's loaded. */
export function animationForSlot(scene: Phaser.Scene, slot: string): string | undefined {
  const animKey = ANIM_KEY_BY_SLOT[slot];
  return animKey && scene.anims.exists(animKey) ? animKey : undefined;
}
