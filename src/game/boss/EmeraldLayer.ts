import Phaser from 'phaser';
import {
  createCollectibleAnimations,
  EMERALD_ANIMATION,
  getCollectibleAnimationAssetUrls,
} from '../collectibles/collectibleAnimations';
import { BOSS_EMERALDS } from './bossConfig';
import { BossDepth } from './bossConstants';
import {
  collectEmeralds,
  planEmeraldSpawn,
  type CollectibleBox,
  type Emerald,
  type EmeraldSpawnRequest,
} from './emeraldField';

/**
 * The emeralds of the current telegraph, drawn and picked up.
 *
 * Owns no timers of its own. A set exists for exactly as long as one attack's
 * windup does: `spawn` is called when a telegraph starts and `clear` when the
 * laser goes live, both driven by the director's existing events. That is what
 * keeps a set from outliving its attack — there is no clock that could drift
 * out of step with the fight, and nothing to leak into the next telegraph.
 *
 * Placement and pickup geometry live in `emeraldField`; this class is only the
 * Phaser sprites and their pooling.
 */
export class EmeraldLayer {
  private readonly sprites = new Map<number, Phaser.GameObjects.Sprite>();
  private emeralds: Emerald[] = [];
  private nextId = 0;

  constructor(private readonly scene: Phaser.Scene) {
    createCollectibleAnimations(scene);
  }

  /** Demand-driven, idempotent: a direct `?scene=boss` still gets the art. */
  static queueAssets(scene: Phaser.Scene): void {
    for (const asset of getCollectibleAnimationAssetUrls()) {
      if (!scene.textures.exists(asset.key)) scene.load.image(asset.key, asset.url);
    }
  }

  get count(): number {
    return this.emeralds.length;
  }

  /** Replaces any previous set, so an attack can never inherit stale emeralds. */
  spawn(request: Omit<EmeraldSpawnRequest, 'nextId'>): void {
    this.clear();
    this.emeralds = planEmeraldSpawn({ ...request, nextId: this.nextId });
    this.nextId += this.emeralds.length;
    for (const emerald of this.emeralds) this.showSprite(emerald);
  }

  /**
   * Collects everything the player is touching and reports how many, so the
   * scene can score and celebrate each one without reaching in here.
   */
  collect(playerBox: CollectibleBox): Emerald[] {
    if (this.emeralds.length === 0) return [];
    const { collected, remaining } = collectEmeralds(this.emeralds, playerBox);
    for (const emerald of collected) this.popSprite(emerald);
    this.emeralds = remaining;
    return collected;
  }

  /** Everything uncollected is gone at once; this is the laser going live. */
  clear(): void {
    for (const emerald of this.emeralds) this.releaseSprite(emerald.id);
    this.emeralds = [];
  }

  private showSprite(emerald: Emerald): void {
    const sprite = this.scene.add
      .sprite(emerald.x, emerald.y, EMERALD_ANIMATION.frameKeys[0])
      .setDepth(BossDepth.COLLECTIBLE);
    // Fit the pickup box by width and let height follow the artwork's own
    // aspect, so the emerald is never stretched to match a square hit area.
    sprite.setScale((BOSS_EMERALDS.halfSizePx * 2) / Math.max(1, sprite.frame.realWidth));
    sprite.play(EMERALD_ANIMATION.animKey);
    this.sprites.set(emerald.id, sprite);
  }

  /** A short pop so a pickup reads even mid-sprint, then the sprite is gone. */
  private popSprite(emerald: Emerald): void {
    const sprite = this.sprites.get(emerald.id);
    if (!sprite) return;
    this.sprites.delete(emerald.id);
    this.scene.tweens.add({
      targets: sprite,
      scale: sprite.scale * 1.6,
      alpha: 0,
      duration: 180,
      onComplete: () => sprite.destroy(),
    });
  }

  private releaseSprite(id: number): void {
    const sprite = this.sprites.get(id);
    if (!sprite) return;
    this.sprites.delete(id);
    this.scene.tweens.killTweensOf(sprite);
    sprite.destroy();
  }

  destroy(): void {
    this.clear();
    // Anything still mid-pop when the scene goes away.
    for (const sprite of this.sprites.values()) {
      this.scene.tweens.killTweensOf(sprite);
      sprite.destroy();
    }
    this.sprites.clear();
  }
}
