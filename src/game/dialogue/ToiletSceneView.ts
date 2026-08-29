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

    this.seated = this.buildActor(cast.seated, STRIP_LEFT + SEATED_NATIVE_X * TOILET_SCALE, FLOOR_Y, 1);
    this.arriving = this.buildActor(cast.arriving, STRIP_LEFT + ARRIVING_NATIVE_X * TOILET_SCALE, FLOOR_Y, -1);

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
  ): ToiletActor {
    const frame = resolveLocomotionFrame(character, 'idle', 0);
    const sprite = this.scene.add.sprite(x, 0, frame.key).setOrigin(0.5, 1);
    const actor: ToiletActor = {
      sprite,
      character,
      motion: 'idle',
      x,
      y: floorY,
      facing,
      currentKey: frame.key,
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
    actor.sprite
      .setFlipX(actor.facing < 0)
      .setScale(scale)
      .setPosition(actor.x, actor.y + footOffset(frame.footGap, scale) + 10);
  }

  resize(width: number, height: number): void {
    this.mask.clear().fillStyle(0xffffff).fillRect(0, 0, width, height);
    const fit = computeCoverFit(TOILET_CANONICAL_WIDTH, TOILET_CANONICAL_HEIGHT, width, height);
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

  getEditableObjects(): EditableObject[] {
    return [];
  }

  destroy(): void {
    this.root.destroy(true);
    this.mask.destroy();
  }
}
