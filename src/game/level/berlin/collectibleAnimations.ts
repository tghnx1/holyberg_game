import Phaser from 'phaser';

/**
 * Animated collectible art for Level 1.
 *
 * Level 1 has exactly one collectible type — the Emerald — so this is a
 * single looping animation rather than a registry keyed by variant. It
 * mirrors obstacleAnimations.ts: the animation only swaps which texture
 * frame a Sprite shows and never touches physics, so the pickup zone
 * LevelBuilder creates from the level config is unaffected by frame count.
 */

export interface CollectibleAnimationDefinition {
  /** Matches a CollectibleConfig.artSlot value; see ArtSlotRegistry.animationForSlot. */
  artSlot: string;
  animKey: string;
  frameKeys: readonly string[];
  frameRate: number;
}

const EMERALD_FRAME_COUNT = 9;

export const EMERALD_ANIMATION = {
  artSlot: 'collectible.emerald',
  animKey: 'emerald-loop',
  frameKeys: Array.from({ length: EMERALD_FRAME_COUNT }, (_, index) => `emerald-${index + 1}`),
  frameRate: 12,
} as const satisfies CollectibleAnimationDefinition;

export const COLLECTIBLE_ANIMATIONS = {
  emerald: EMERALD_ANIMATION,
} as const satisfies Record<string, CollectibleAnimationDefinition>;

export interface CollectibleAnimationAsset {
  key: string;
  url: string;
}

export function getCollectibleAnimationAssetUrls(): CollectibleAnimationAsset[] {
  return EMERALD_ANIMATION.frameKeys.map((key, index) => ({
    key,
    url: `assets/level_1/emerald ${index + 1}.png`,
  }));
}

/** Idempotent: safe to call once per scene even though anims are game-global. */
export function createCollectibleAnimations(scene: Phaser.Scene): void {
  for (const definition of Object.values(COLLECTIBLE_ANIMATIONS)) {
    if (scene.anims.exists(definition.animKey)) continue;
    scene.anims.create({
      key: definition.animKey,
      frames: definition.frameKeys.map((key) => ({ key })),
      frameRate: definition.frameRate,
      repeat: -1,
    });
  }
}
