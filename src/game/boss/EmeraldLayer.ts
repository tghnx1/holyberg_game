import Phaser from 'phaser';
import {
  createCollectibleAnimations,
  EMERALD_ANIMATION,
  getCollectibleAnimationAssetUrls,
} from '../collectibles/collectibleAnimations';
import { buildSceneLayoutPayload, removeSceneObjectLayout } from '../systems/sceneLayout';
import type { EditorSavePayload } from '../systems/editableSceneContract';
import type { EditableObject } from '../systems/SceneEditor';
import { BOSS_EMERALDS } from './bossConfig';
import { BossDepth } from './bossConstants';
import {
  getAuthoredEmeraldSpots,
  nextEmeraldSpotId,
  persistEmeraldSpot,
  type EmeraldSpot,
} from './bossEmeraldSpots';
import { bossEmeraldWindowSceneKey } from './bossEmeraldWindows';
import type { ArenaBounds } from './types';
import {
  collectEmeralds,
  type CollectibleBox,
} from './emeraldField';

/** Remaining, uncollected emeralds stay visible this long after the laser goes live. */
export const EMERALD_HIDE_DELAY_MS = 1500;

interface LiveEmerald {
  spot: EmeraldSpot;
  sprite: Phaser.GameObjects.Sprite;
}

/**
 * The arena's authored emeralds: drawn, picked up, and editable.
 *
 * Each stable telegraph occurrence owns one independent scene-layout slice.
 * Its exact authored sprites are created when that telegraph starts, which is
 * what the editor exposes while fight progression is frozen.
 *
 * The lifecycle is still the attack's and owns no timer of its own: `offer` is
 * called when a telegraph starts and `hideAll` when the laser goes live, both
 * driven by the director's existing events. Collecting hides a spot until the
 * next telegraph rather than destroying it — a spot is a place an emerald
 * appears, not a single pickup, so it comes back for the next attack.
 *
 * Pickup geometry lives in `emeraldField`; authored data in
 * `bossEmeraldSpots`. This class is only lifecycle, sprites and editor binding.
 */
export class EmeraldLayer {
  private readonly emeralds: LiveEmerald[] = [];
  /** The subset the current telegraph is offering; empty between attacks. */
  private offered: EmeraldSpot[] = [];
  /** Mid-pickup animation: visible, but no longer offered and not to be reset. */
  private readonly popping = new Set<string>();
  private authoring = false;
  private windowId?: string;
  private windowSceneKey?: string;
  /** Uniform world-space shift applied to every authored (player-relative) x this window. */
  private translateDeltaX = 0;
  private bounds: ArenaBounds = { minX: -Infinity, maxX: Infinity };
  /** Pending "hide whatever's left" call from the last `attackActivated`. */
  private hideTimer?: Phaser.Time.TimerEvent;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sceneKey: string,
  ) {
    createCollectibleAnimations(scene);
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

  get activeWindowId(): string | undefined {
    return this.windowId;
  }

  /** Arena walls the current translated group is kept inside of. */
  setBounds(bounds: ArenaBounds): void {
    this.bounds = bounds;
  }

  /**
   * Rebuilds exactly the layout authored for this one telegraph occurrence,
   * translated as one composition so it lands near `playerX` — the player's
   * position at the instant this telegraph starts.
   *
   * Authored spot x is stored relative to that anchor, not as an absolute
   * world point, so the same authored spacing reads close to the player
   * wherever they were standing. A stale hide from the previous attack must
   * never fire against this new window's emeralds, so any pending timer is
   * cancelled here too.
   */
  showWindow(windowId: string, playerX: number): void {
    this.cancelScheduledHide();
    this.clearSprites();
    this.windowId = windowId;
    this.windowSceneKey = bossEmeraldWindowSceneKey(this.sceneKey, windowId);
    const spots = getAuthoredEmeraldSpots(this.windowSceneKey);
    this.translateDeltaX = this.computeTranslateDeltaX(playerX, spots);
    for (const spot of spots) this.add(spot);
    // Collision/collect math and the boss scene's own score-popup placement
    // both need where the emerald is actually drawn, not its authored
    // player-relative offset — `resolvedSpot` is what translates it.
    this.offered = this.emeralds.map((emerald) => this.resolvedSpot(emerald));
    this.syncVisibility();
  }

  /** `emerald.spot` translated into the world point it's actually drawn at. */
  private resolvedSpot(emerald: LiveEmerald): EmeraldSpot {
    return { ...emerald.spot, x: emerald.spot.x + this.translateDeltaX };
  }

  /**
   * `playerX` plus a uniform shift only large enough to keep every spot in
   * the group inside the arena — the group moves together, so one emerald
   * hanging past a wall shifts all of them, it never restretches the
   * authored spacing.
   */
  private computeTranslateDeltaX(playerX: number, spots: readonly EmeraldSpot[]): number {
    if (spots.length === 0) return playerX;
    const rawXs = spots.map((spot) => playerX + spot.x);
    const minRaw = Math.min(...rawXs);
    const maxRaw = Math.max(...rawXs);
    let shift = 0;
    if (minRaw < this.bounds.minX) shift = this.bounds.minX - minRaw;
    else if (maxRaw > this.bounds.maxX) shift = this.bounds.maxX - maxRaw;
    return playerX + shift;
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
    this.cancelScheduledHide();
    this.offered = [];
    this.stopPops();
    this.syncVisibility();
  }

  /**
   * The laser just went live: remaining, uncollected emeralds stay visible
   * and collectable for one more beat before `hideAll` actually runs. Any
   * telegraph, fight end or teardown that happens before then must cancel
   * this — `showWindow`, `hideAll` and `destroy` all do.
   */
  scheduleHide(delayMs: number = EMERALD_HIDE_DELAY_MS): void {
    this.cancelScheduledHide();
    this.hideTimer = this.scene.time.delayedCall(delayMs, () => {
      this.hideTimer = undefined;
      this.hideAll();
    });
  }

  private cancelScheduledHide(): void {
    this.hideTimer?.remove(false);
    this.hideTimer = undefined;
  }

  /**
   * While the editor is open every spot is shown, offered or not: you cannot
   * arrange emeralds you cannot see, and the fight is paused anyway.
   */
  setAuthoringVisible(visible: boolean): void {
    this.authoring = visible;
    this.stopPops();
    this.syncVisibility();
  }

  buildEditorSave(): EditorSavePayload | undefined {
    if (!this.windowSceneKey) return undefined;
    return {
      route: '/__scene-editor/save-layout',
      body: buildSceneLayoutPayload(this.windowSceneKey),
    };
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
          // Stored authored x is relative to this window's player anchor, so
          // the editor's absolute drag position has to be un-translated
          // before it is written back.
          x: transform.x - this.translateDeltaX,
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
    if (this.windowSceneKey) removeSceneObjectLayout(this.windowSceneKey, emerald.spot.id);
  }

  private persist(spot: EmeraldSpot): void {
    if (this.windowSceneKey) persistEmeraldSpot(this.windowSceneKey, spot);
  }

  // ------------------------------------------------------------- sprites

  private add(spot: EmeraldSpot): LiveEmerald {
    const sprite = this.scene.add
      .sprite(spot.x + this.translateDeltaX, spot.y, EMERALD_ANIMATION.frameKeys[0])
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
    this.cancelScheduledHide();
    this.clearSprites();
    this.windowId = undefined;
    this.windowSceneKey = undefined;
  }

  private clearSprites(): void {
    for (const emerald of this.emeralds) {
      this.scene.tweens.killTweensOf(emerald.sprite);
      emerald.sprite.destroy();
    }
    this.emeralds.length = 0;
    this.offered = [];
    this.popping.clear();
  }
}
