import Phaser from 'phaser';

/**
 * Animated collectible art, shared by every level that has pickups.
 *
 * The Emerald started as Level 1's only collectible and now also appears in
 * the boss arena, so both the artwork and this loader live outside
 * `level/berlin/`. There is still exactly one collectible type, so this is a
 * single looping animation rather than a registry keyed by variant.
 *
 * The animation only swaps which texture frame a Sprite shows and never
 * touches physics, so the pickup zones its callers build — LevelBuilder's from
 * the Level 1 config, the boss arena's from its own placement rules — are
 * unaffected by frame count.
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
    url: `assets/collectibles/emerald/${String(index + 1).padStart(2, '0')}.png`,
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
