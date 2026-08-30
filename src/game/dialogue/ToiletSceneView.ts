import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../constants';
import { footOffset } from '../characters/characterAnimation';
import {
  resolveLocomotionFrame,
  resolveLocomotionPose,
  type LocomotionMotion,
} from '../characters/characterLocomotion';
import { resolveGameplayScale, type CharacterAssetRef, type CharacterDefinition } from '../characters/characterManifest';
import type { EditableObject } from '../systems/SceneEditor';
import { DialogueLayout } from './dialogueConstants';
import { computeCoverFit } from './dialogueLayoutMetrics';
import {
  LEVEL4_ASSET_KEYS,
  TOILET_STRIP_NATIVE_HEIGHT,
  TOILET_TEXTURE_UPSCALE,
} from '../level/level4/level4Assets';
import type { ResolvedSceneCast } from './dialogueCast';
import { getSceneObjectLayout, setSceneObjectLayout } from '../systems/sceneLayout';

/**
 * Ids this view authors, under the dialogue scene's own key in the shared
 * scene-layout store. Prefixed so the toilet dialogue's staging can never
 * collide with the metro station's, which keeps its own separate config.
 */
export const TOILET_VIEW_IDS = {
  composition: 'toilet-scene',
  player: 'toilet-player',
  npc: 'toilet-npc',
} as const;

/**
 * Fixed canonical box this composition is authored against, independent of the
 * live viewport — the same device `StationSceneView` uses, and the same size,
 * so both dialogue scenes compose identically and `resize()` is a single
 * uniform cover fit rather than a per-object re-layout.
 */
const TOILET_CANONICAL_WIDTH = Math.round(DESIGN_WIDTH * DialogueLayout.scenePanelWidthRatio);
const TOILET_CANONICAL_HEIGHT = DESIGN_HEIGHT - DialogueLayout.topBarHeight - DialogueLayout.bottomBarHeight;

/**
 * Authored-pixel scale for the room, matching the gameplay scene's proportion:
 * the strip is a whole floor-to-ceiling bathroom in 175px, so drawn at ~2.56x
 * it stands about three character-heights, which is the character-to-room
 * proportion the metro panel already reads at.
 *
 * At this scale the room is *taller* than the canonical box, so the panel is
 * covered and cropped rather than letterboxed — the previous contain-fit showed
 * the whole 1532px strip at once, which is what made it a thin sprite band
 * floating in black.
 */
const TOILET_SCALE = 448 / TOILET_STRIP_NATIVE_HEIGHT;

/** Native row the actors stand on: the floor the stall bases sit on. */
const FLOOR_NATIVE_Y = 147;
/** Native x the composition is centred on — the open stall and its door. */
const FOCUS_NATIVE_X = 682;

/** Where the two actors stand, in authored pixels. */
const SEATED_NATIVE_X = 596;
const ARRIVING_NATIVE_X = 648;

/** Leaves a strip of walkway in front of the actors rather than cropping at their feet. */
const FLOOR_Y = Math.round(TOILET_CANONICAL_HEIGHT * 0.82);
const STRIP_LEFT = TOILET_CANONICAL_WIDTH / 2 - FOCUS_NATIVE_X * TOILET_SCALE;
const STRIP_TOP = FLOOR_Y - FLOOR_NATIVE_Y * TOILET_SCALE;

interface ToiletActor {
  sprite: Phaser.GameObjects.Sprite;
  character: CharacterDefinition;
  motion: LocomotionMotion;
  x: number;
  y: number;
  facing: 1 | -1;
  currentKey?: string;
  /** Editable id this actor's authored offset is stored under. */
  layoutId: string;
  /** Authored presentation, re-applied every sync so nothing overwrites it. */
  offsetX: number;
  offsetY: number;
  scale: number;
}

/**
 * The left-hand panel for the Level 4 toilet dialogue: the player and the
 * waiting NPC standing by the open stall.
 *
 * Composed in canonical space and then covered onto the live panel exactly the
 * way the metro station is, so both dialogues frame their art the same way at
 * every aspect ratio and neither is tuned for one desktop resolution.
 */
export class ToiletSceneView {
  readonly root: Phaser.GameObjects.Container;
  private readonly content: Phaser.GameObjects.Container;
  private readonly mask: Phaser.GameObjects.Graphics;
  private readonly background: Phaser.GameObjects.Image;
  private readonly ceiling: Phaser.GameObjects.Rectangle;
  private readonly door: Phaser.GameObjects.Image;
  private readonly seated: ToiletActor;
  private readonly arriving: ToiletActor;
  private panelWidth = 0;
  private panelHeight = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
    cast: ResolvedSceneCast,
  ) {
    // The room is shorter than the canonical box once its aspect is respected,
    // so its own ceiling tone carries the last few pixels rather than black.
    this.ceiling = this.scene.add
      .rectangle(0, 0, TOILET_CANONICAL_WIDTH, TOILET_CANONICAL_HEIGHT, 0x171a24)
      .setOrigin(0, 0);
    this.background = this.scene.add
      .image(STRIP_LEFT, STRIP_TOP, LEVEL4_ASSET_KEYS.toiletStrip)
      .setOrigin(0, 0)
      .setScale(TOILET_SCALE / TOILET_TEXTURE_UPSCALE);
    // Hangs in the open stall's frame, upright, exactly as in the level.
    this.door = this.scene.add
      .image(STRIP_LEFT + 700 * TOILET_SCALE, STRIP_TOP + FLOOR_NATIVE_Y * TOILET_SCALE, LEVEL4_ASSET_KEYS.stallDoor)
      .setOrigin(1, 1);
    this.door.setDisplaySize(35 * TOILET_SCALE, 97 * TOILET_SCALE);
    this.door.scaleX *= 0.12;

    this.seated = this.buildActor(
      cast.seated,
      STRIP_LEFT + SEATED_NATIVE_X * TOILET_SCALE,
      FLOOR_Y,
      1,
      TOILET_VIEW_IDS.player,
    );
    this.arriving = this.buildActor(
      cast.arriving,
      STRIP_LEFT + ARRIVING_NATIVE_X * TOILET_SCALE,
      FLOOR_Y,
      -1,
      TOILET_VIEW_IDS.npc,
    );

    this.content = this.scene.add.container(0, 0, [
      this.ceiling,
      this.background,
      this.door,
      this.seated.sprite,
      this.arriving.sprite,
    ]);
    this.root = this.scene.add.container(0, 0, [this.content]);

    this.mask = this.scene.add.graphics().setVisible(false);
    this.root.setMask(this.mask.createGeometryMask());

    this.resize(width, height);
  }

  private buildActor(
    character: CharacterDefinition,
    x: number,
    floorY: number,
    facing: 1 | -1,
    layoutId: string,
  ): ToiletActor {
    const frame = resolveLocomotionFrame(character, 'idle', 0);
    const sprite = this.scene.add.sprite(x, 0, frame.key).setOrigin(0.5, 1);
    // Authored in canonical composition space, so an actor keeps its place
    // inside the room however the whole composition is later moved or scaled.
    const saved = getSceneObjectLayout(this.scene.scene.key, layoutId);
    const actor: ToiletActor = {
      sprite,
      character,
      motion: 'idle',
      x,
      y: floorY,
      facing,
      currentKey: frame.key,
      layoutId,
      offsetX: (saved?.xRatio ?? 0) * TOILET_CANONICAL_WIDTH,
      offsetY: (saved?.yRatio ?? 0) * TOILET_CANONICAL_HEIGHT,
      scale: saved?.scale ?? 1,
    };
    this.syncActor(actor, this.scene.time.now);
    return actor;
  }

  private syncActor(actor: ToiletActor, now: number): void {
    const frame: CharacterAssetRef = resolveLocomotionFrame(actor.character, actor.motion, now);
    // The shared gameplay scale, untouched: the actors are the same size here
    // as they are in Berlin and in the level itself.
    const scale = resolveGameplayScale(
      actor.character,
      resolveLocomotionPose(actor.character, actor.motion),
    );
    if (frame.key !== actor.currentKey) {
      actor.sprite.setTexture(frame.key);
      actor.currentKey = frame.key;
    }
    // The authored offset and scale ride on top of the composed placement.
    // `syncActor` runs every frame, so applying them here — rather than only
    // on the sprite once — is what stops an editor drag being overwritten on
    // the next update.
    actor.sprite
      .setFlipX(actor.facing < 0)
      .setScale(scale * actor.scale)
      .setPosition(
        actor.x + actor.offsetX,
        actor.y + footOffset(frame.footGap, scale) + 10 + actor.offsetY,
      );
  }

  /** Turns an editor transform on an actor back into its authored offset. */
  private applyActorEdit(
    actor: ToiletActor,
    transform: { x: number; y: number; scaleY: number },
  ): void {
    const frame = resolveLocomotionFrame(actor.character, actor.motion, this.scene.time.now);
    const baseScale = resolveGameplayScale(
      actor.character,
      resolveLocomotionPose(actor.character, actor.motion),
    );
    if (baseScale > 0) actor.scale = transform.scaleY / baseScale;
    actor.offsetX = transform.x - actor.x;
    // `syncActor` seats the sprite with the *base* scale, so the inverse uses
    // the same one or the offset would drift by a foot gap on every resize.
    actor.offsetY = transform.y - (actor.y + footOffset(frame.footGap, baseScale) + 10);
    setSceneObjectLayout(this.scene.scene.key, actor.layoutId, {
      xRatio: actor.offsetX / TOILET_CANONICAL_WIDTH,
      yRatio: actor.offsetY / TOILET_CANONICAL_HEIGHT,
      scale: actor.scale,
    });
  }

  /**
   * The mask is only ever the boundary between this panel and the portrait /
   * dialogue UI beside it — never a framing device. Framing itself comes from
   * `applyComposition`.
   */
  resize(width: number, height: number): void {
    this.panelWidth = width;
    this.panelHeight = height;
    this.mask.clear().fillStyle(0xffffff).fillRect(0, 0, width, height);
    this.applyComposition();
  }

  /**
   * Places the whole composition.
   *
   * Until someone frames it in the editor this is the composed cover fit, so
   * the default look is unchanged. Once it *has* been authored, the saved
   * position and scale are used verbatim and the cover fit is not consulted
   * again — a resize can no longer re-crop a framing that was set by hand,
   * which is what made an authored composition impossible to keep.
   */
  private applyComposition(): void {
    const saved = getSceneObjectLayout(this.scene.scene.key, TOILET_VIEW_IDS.composition);
    if (saved?.scale !== undefined) {
      this.content
        .setScale(saved.scale)
        .setPosition(
          (saved.xRatio ?? 0) * this.panelWidth,
          (saved.yRatio ?? 0) * this.panelHeight,
        );
      return;
    }
    const fit = computeCoverFit(
      TOILET_CANONICAL_WIDTH,
      TOILET_CANONICAL_HEIGHT,
      this.panelWidth,
      this.panelHeight,
    );
    this.content.setScale(fit.scale).setPosition(fit.offsetX, fit.offsetY);
  }

  /** No entrance here: the NPC is already waiting by the stall. */
  playArrival(onComplete: () => void): void {
    this.scene.time.delayedCall(220, onComplete);
  }

  update(now: number): void {
    this.syncActor(this.seated, now);
    this.syncActor(this.arriving, now);
  }

  /**
   * The composition as a whole, plus each actor inside it:
   *
   * ```text
   * TOILET DIALOGUE SCENE   <- background + door + both actors, moved together
   *   |- PLAYER
   *   |- STORY NPC
   * ```
   *
   * The actors are children of the same container the composition edits, so
   * framing the room first and then nudging an actor inside it composes the
   * way the hierarchy suggests. Every entry is presentation only: nothing here
   * touches gameplay scale, physics or the shared character manifest.
   */
  getEditableObjects(): EditableObject[] {
    return [
      {
        id: TOILET_VIEW_IDS.composition,
        label: 'TOILET DIALOGUE SCENE',
        target: this.content,
        getNativeSize: () => ({
          width: TOILET_CANONICAL_WIDTH,
          height: TOILET_CANONICAL_HEIGHT,
        }),
        onChange: (transform) => {
          setSceneObjectLayout(this.scene.scene.key, TOILET_VIEW_IDS.composition, {
            xRatio: this.panelWidth > 0 ? transform.x / this.panelWidth : 0,
            yRatio: this.panelHeight > 0 ? transform.y / this.panelHeight : 0,
            scale: transform.scaleY,
          });
        },
      },
      this.actorEditable(this.seated, 'PLAYER'),
      this.actorEditable(this.arriving, 'STORY NPC'),
    ];
  }

  private actorEditable(actor: ToiletActor, label: string): EditableObject {
    return {
      id: actor.layoutId,
      label,
      target: actor.sprite,
      // Aspect ratio is preserved: a character stretched on one axis is never
      // what is wanted here.
      getNativeSize: () => ({
        width: actor.sprite.frame.realWidth,
        height: actor.sprite.frame.realHeight,
      }),
      onChange: (transform) => this.applyActorEdit(actor, transform),
    };
  }

  /** Everything this view authors, for the scene's save payload. */
  getLayoutIds(): string[] {
    return [TOILET_VIEW_IDS.composition, TOILET_VIEW_IDS.player, TOILET_VIEW_IDS.npc];
  }

  destroy(): void {
    this.root.destroy(true);
    this.mask.destroy();
  }
}
