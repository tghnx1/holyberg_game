import Phaser from 'phaser';

/**
 * Animated obstacle art: frame keys, load specs and the looping Phaser
 * animations built once from them.
 *
 * The animation only ever swaps which texture frame a Sprite shows; it never
 * touches physics. Each obstacle's collision body comes from its own
 * `hitbox` in the level config (see entityZoneLayout.ts) and is created once
 * by LevelBuilder, completely independent of how many visual frames exist or
 * how often they change.
 */

export interface ObstacleAnimationDefinition {
  /** Matches an ObstacleConfig.artSlot value; see ArtSlotRegistry.animationForSlot. */
  artSlot: string;
  animKey: string;
  frameKeys: readonly string[];
  frameRate: number;
}

export const OBSTACLE_ANIMATIONS = {
  homeless: {
    artSlot: 'obstacle.homeless',
    animKey: 'homeless-walk',
    frameKeys: ['homeless-1', 'homeless-2', 'homeless-3', 'homeless-4', 'homeless-5', 'homeless-6'],
    frameRate: 8,
  },
  stinkyCloud: {
    artSlot: 'obstacle.stinkyCloud',
    animKey: 'stinky-cloud-loop',
    frameKeys: ['stinky-cloud-1', 'stinky-cloud-2', 'stinky-cloud-3', 'stinky-cloud-4'],
    frameRate: 6,
  },
} as const satisfies Record<string, ObstacleAnimationDefinition>;

export interface ObstacleAnimationAsset {
  key: string;
  url: string;
}

export function getObstacleAnimationAssetUrls(): ObstacleAnimationAsset[] {
  return [
    ...OBSTACLE_ANIMATIONS.homeless.frameKeys.map((key, index) => ({
      key,
      url: `assets/level_1/homeless ${index + 1}.png`,
    })),
    ...OBSTACLE_ANIMATIONS.stinkyCloud.frameKeys.map((key, index) => ({
      key,
      url: `assets/level_1/stinky cloud ${index + 1}.png`,
    })),
  ];
}

/** Idempotent: safe to call once per scene even though anims are game-global. */
export function createObstacleAnimations(scene: Phaser.Scene): void {
  for (const definition of Object.values(OBSTACLE_ANIMATIONS)) {
    if (scene.anims.exists(definition.animKey)) continue;
    scene.anims.create({
      key: definition.animKey,
      frames: definition.frameKeys.map((key) => ({ key })),
      frameRate: definition.frameRate,
      repeat: -1,
    });
  }
}
