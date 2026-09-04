import Phaser from 'phaser';
import {
  createCollectibleAnimations,
  EMERALD_ANIMATION,
  getCollectibleAnimationAssetUrls,
} from '../collectibles/collectibleAnimations';
import { removeSceneObjectLayout } from '../systems/sceneLayout';
import type { EditableObject } from '../systems/SceneEditor';
import { BOSS_EMERALDS } from './bossConfig';
import { BossDepth } from './bossConstants';
import {
  getAuthoredEmeraldSpots,
  nextEmeraldSpotId,
  persistEmeraldSpot,
  type EmeraldSpot,
} from './bossEmeraldSpots';
import {
  collectEmeralds,
  selectTelegraphEmeralds,
  type CollectibleBox,
  type EmeraldSelectionRequest,
} from './emeraldField';

interface LiveEmerald {
  spot: EmeraldSpot;
  sprite: Phaser.GameObjects.Sprite;
}

/**
 * The arena's authored emeralds: drawn, picked up, and editable.
 *
 * Every authored spot owns a sprite for the whole life of the scene, and the
 * fight only changes which of them are *visible*. That is what lets the same
 * objects be dragged, copied and deleted in SceneEditor — an emerald that only
 * existed during a telegraph would vanish the moment the editor paused the
 * fight, which is exactly when you want to arrange it.
 *
 * The lifecycle is still the attack's and owns no timer of its own: `offer` is
 * called when a telegraph starts and `hideAll` when the laser goes live, both
 * driven by the director's existing events. Collecting hides a spot until the
 * next telegraph rather than destroying it — a spot is a place an emerald
 * appears, not a single pickup, so it comes back for the next attack.
 *
 * Selection and pickup geometry live in `emeraldField`; the authored data in
 * `bossEmeraldSpots`. This class is only the sprites and the editor bindings.
 */
export class EmeraldLayer {
  private readonly emeralds: LiveEmerald[] = [];
  /** The subset the current telegraph is offering; empty between attacks. */
  private offered: EmeraldSpot[] = [];
  /** Mid-pickup animation: visible, but no longer offered and not to be reset. */
  private readonly popping = new Set<string>();
  private authoring = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sceneKey: string,
  ) {
    createCollectibleAnimations(scene);
    for (const spot of getAuthoredEmeraldSpots(sceneKey)) this.add(spot);
  }

  /** Demand-driven, idempotent: a direct `?scene=boss` still gets the art. */
  static queueAssets(scene: Phaser.Scene): void {
    for (const asset of getCollectibleAnimationAssetUrls()) {
      if (!scene.textures.exists(asset.key)) scene.load.image(asset.key, asset.url);
    }
  }

  /** How many are collectable right now; 0 between attacks. */
  get offeredCount(): number {
    return this.offered.length;
  }

  /** Shows the authored spots this telegraph puts within reach. */
  offer(request: EmeraldSelectionRequest): void {
    this.offered = selectTelegraphEmeralds(
      this.emeralds.map((emerald) => emerald.spot),
      request,
    );
    this.syncVisibility();
  }

  /**
   * Collects everything the player is touching and reports it, so the scene
   * can score and celebrate each one without reaching in here.
   */
  collect(playerBox: CollectibleBox): EmeraldSpot[] {
    if (this.offered.length === 0) return [];
    const { collected, remaining } = collectEmeralds(this.offered, playerBox);
    this.offered = remaining;
    for (const spot of collected) this.pop(spot.id);
    this.syncVisibility();
    return collected;
  }

  /** The laser is live: whatever was not collected is gone, now. */
  hideAll(): void {
    this.offered = [];
    this.stopPops();
    this.syncVisibility();
  }

  /**
   * While the editor is open every spot is shown, offered or not: you cannot
   * arrange emeralds you cannot see, and the fight is paused anyway.
   */
  setAuthoringVisible(visible: boolean): void {
    this.authoring = visible;
    if (!visible) this.offered = [];
    this.stopPops();
    this.syncVisibility();
  }

  // ------------------------------------------------------------- editing

  getEditableObjects(): EditableObject[] {
    return this.emeralds.map((emerald) => this.toEditableObject(emerald));
  }

  /**
   * An emerald is one of the things duplicating genuinely makes sense for: an
   * arena is tuned by scattering the same pickup along it, so copy/paste beats
   * hand-editing another JSON entry. Declaring `clone` and `remove` is the
   * whole opt-in — the shared editor core offers each to exactly the objects
   * that have it, which is why the boss and the player (singletons, both) get
   * neither.
   */
  private toEditableObject(emerald: LiveEmerald): EditableObject {
    return {
      id: emerald.spot.id,
      label: 'EMERALD',
      target: emerald.sprite,
      resizable: true,
      getNativeSize: () => ({
        width: emerald.sprite.frame.realWidth,
        height: emerald.sprite.frame.realHeight,
      }),
      onChange: (transform) => {
        emerald.spot = {
          ...emerald.spot,
          x: transform.x,
          y: transform.y,
          scale: this.scaleFromDisplay(emerald.sprite, transform.scaleY),
        };
        this.persist(emerald.spot);
      },
      clone: () => this.toEditableObject(this.duplicate(emerald)),
      // Dropping it from `emeralds` is what omits it from the next save, and
      // forgetting its layout entry is what keeps it gone across a reload —
      // `setSceneObjectLayout` can only add or update.
      remove: () => this.removeEmerald(emerald),
    };
  }

  private duplicate(source: LiveEmerald): LiveEmerald {
    const taken = new Set(this.emeralds.map((emerald) => emerald.spot.id));
    const spot: EmeraldSpot = {
      id: nextEmeraldSpotId(taken),
      x: source.spot.x,
      y: source.spot.y,
      scale: source.spot.scale,
    };
    const created = this.add(spot);
    this.persist(spot);
    return created;
  }

  private removeEmerald(emerald: LiveEmerald): void {
    const index = this.emeralds.indexOf(emerald);
    if (index < 0) return;
    this.emeralds.splice(index, 1);
    this.offered = this.offered.filter((spot) => spot.id !== emerald.spot.id);
    this.scene.tweens.killTweensOf(emerald.sprite);
    emerald.sprite.destroy();
    removeSceneObjectLayout(this.sceneKey, emerald.spot.id);
  }

  private persist(spot: EmeraldSpot): void {
    persistEmeraldSpot(this.sceneKey, spot);
  }

  // ------------------------------------------------------------- sprites

  private add(spot: EmeraldSpot): LiveEmerald {
    const sprite = this.scene.add
      .sprite(spot.x, spot.y, EMERALD_ANIMATION.frameKeys[0])
      .setDepth(BossDepth.COLLECTIBLE)
      // Paste happens after authoring was enabled, so a new sprite must
      // inherit that live visibility immediately.
      .setVisible(this.authoring);
    sprite.setScale(this.displayScale(sprite) * spot.scale);
    sprite.play(EMERALD_ANIMATION.animKey);
    const emerald: LiveEmerald = { spot, sprite };
    this.emeralds.push(emerald);
    return emerald;
  }

  /**
   * Fits the pickup box by width and lets height follow the artwork's own
   * aspect, so an emerald is never stretched to match a square hit area.
   */
  private displayScale(sprite: Phaser.GameObjects.Sprite): number {
    return (BOSS_EMERALDS.halfSizePx * 2) / Math.max(1, sprite.frame.realWidth);
  }

  /** Inverse of `displayScale`: the authored multiplier a drag just produced. */
  private scaleFromDisplay(sprite: Phaser.GameObjects.Sprite, displayed: number): number {
    return Math.abs(displayed / this.displayScale(sprite)) || 1;
  }

  /**
   * Shows exactly what should be showing, and restores anything a pickup
   * animation left shrunk or faded. Positions are not touched: the sprite is
   * where the editor put it, and `onChange` is what keeps the spot in step.
   */
  private syncVisibility(): void {
    const offeredIds = new Set(this.offered.map((spot) => spot.id));
    for (const emerald of this.emeralds) {
      // A sprite mid-pop owns its own alpha and scale until the tween ends.
      if (this.popping.has(emerald.spot.id)) continue;
      const visible = this.authoring || offeredIds.has(emerald.spot.id);
      emerald.sprite.setVisible(visible);
      if (visible) this.resetAppearance(emerald);
    }
  }

  private resetAppearance(emerald: LiveEmerald): void {
    emerald.sprite
      .setAlpha(1)
      .setScale(this.displayScale(emerald.sprite) * emerald.spot.scale);
  }

  /** A short pop so a pickup reads even mid-sprint; the spot itself stays. */
  private pop(id: string): void {
    const emerald = this.emeralds.find((entry) => entry.spot.id === id);
    if (!emerald) return;
    const { sprite } = emerald;
    this.popping.add(id);
    this.scene.tweens.killTweensOf(sprite);
    this.scene.tweens.add({
      targets: sprite,
      scale: sprite.scale * 1.6,
      alpha: 0,
      duration: 180,
      onComplete: () => {
        this.popping.delete(id);
        sprite.setVisible(false);
        this.resetAppearance(emerald);
      },
    });
  }

  /** Cuts every pickup animation short, so nothing lingers into a laser. */
  private stopPops(): void {
    for (const emerald of this.emeralds) {
      if (!this.popping.delete(emerald.spot.id)) continue;
      this.scene.tweens.killTweensOf(emerald.sprite);
      emerald.sprite.setVisible(false);
      this.resetAppearance(emerald);
    }
  }

  destroy(): void {
    for (const emerald of this.emeralds) {
      this.scene.tweens.killTweensOf(emerald.sprite);
      emerald.sprite.destroy();
    }
    this.emeralds.length = 0;
    this.offered = [];
    this.popping.clear();
  }
}
