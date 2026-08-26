import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../constants';
import type { EditableObject, EditableTransform } from '../systems/SceneEditor';
import { DialogueLayout } from './dialogueConstants';
import { computeCoverFit } from './dialogueLayoutMetrics';
import {
  DEFAULT_STATION_LAYOUT,
  resolveStationTransform,
  toStationObjectLayout,
  type DialogueStationLayoutConfig,
  type StationObjectKey,
} from './dialogueStationLayout';
import { DIALOGUE_STATION_TEXTURE_KEYS } from './stationAssets';
import { footOffset } from '../characters/characterAnimation';
import type { CharacterAssetRef } from '../characters/characterManifest';
import type { ResolvedSceneCast } from './dialogueCast';

/**
 * Fixed canonical box the station composition is authored and laid out
 * against, independent of the live viewport.
 *
 * Every object's rest pose (`dialogueStationLayout.json`) is a ratio of this
 * box, not of whatever panel size happens to be live when the scene is
 * built — that was the actual bug: `resolveStationTransform` used to resolve
 * x from the *live* panel width while scale came from the live panel height,
 * so any resize whose aspect ratio differed from the one active at
 * construction shifted every object horizontally relative to the art
 * underneath it, most visibly on phone aspect ratios far from desktop's.
 *
 * Chosen to equal the scene panel's own size at the 16:9 aspect ratio the
 * composition was authored at (matching DESIGN_WIDTH/DESIGN_HEIGHT used
 * throughout the game), so canonical space and the live panel coincide
 * exactly there and desktop's appearance is unchanged bit-for-bit.
 */
const STATION_CANONICAL_WIDTH = Math.round(DESIGN_WIDTH * DialogueLayout.scenePanelWidthRatio);
const STATION_CANONICAL_HEIGHT = DESIGN_HEIGHT - DialogueLayout.topBarHeight - DialogueLayout.bottomBarHeight;

/** Seconds the train sits still before it departs. */
const STATIONARY_PAUSE_MS = 600;
/** How long the departure takes; the tween's own easing supplies the accel. */
const DEPART_DURATION_MS = 2200;
/** Fraction of the departure travelled before the train reads as "mostly gone". */
const ARRIVAL_TRIGGER_PROGRESS = 0.82;
/** Within the requested 80-100ms/frame window. */
const APPEAR_FRAME_DURATION_MS = 90;

/** Native canvas height shared by every character's dialogue frame. */
const CHARACTER_CANVAS_HEIGHT = 184;

/**
 * Transparent padding below the drawn figure in each frame, so every frame's
 * feet land on the same floor line regardless of how much of the canvas that
 * frame's artwork fills (the same idea as CharacterAssetRef.footGap).
 */

/** background/foreground share the same source art, so 1px = 1px between the two. */
const BACKDROP_NATIVE_HEIGHT_FALLBACK = 887;

/**
 * The left-hand panel for Dialogue 1: a metro platform where a train departs
 * and a second character walks on once it has mostly left.
 *
 * Layers, back to front: background_metro, the train, first_plan_metro, then
 * the two actors (seated, then the arriving one once revealed) on top, so both stay
 * visible over the foreground art. Everything is laid out once against a
 * fixed canonical box (`STATION_CANONICAL_WIDTH`/`_HEIGHT`), never the live
 * panel; `resize()` then applies one uniform scale/position to cover
 * whatever the panel's current size is, so the composition is identical in
 * relative terms at every aspect ratio and the departure/appearance sequence
 * never has to be rebuilt or reset mid-animation.
 *
 * Every object's *rest pose* (position + scale) comes from
 * `dialogueStationLayout.ts`/`dialogueStationLayout.json` rather than
 * hardcoded numbers, and is editable at runtime via `getEditableObjects()`
 * (see DialogueScene's dev-only SceneEditor wiring). Train departure and
 * the arriving actor's per-frame foot alignment are *derived* from that rest pose each
 * time it changes, so editing it live can't desync the animations.
 */
export class StationSceneView {
  readonly root: Phaser.GameObjects.Container;
  private readonly content: Phaser.GameObjects.Container;
  private readonly background?: Phaser.GameObjects.Image;
  private readonly train: Phaser.GameObjects.Image;
  private readonly foreground?: Phaser.GameObjects.Image;
  private readonly seated: Phaser.GameObjects.Image;
  private readonly arriving: Phaser.GameObjects.Sprite;
  private readonly mask: Phaser.GameObjects.Graphics;
  /** Recomputed from the train's current rest transform on every edit. */
  private trainDepartX = 0;
  /** Recomputed from the arriving actor's settled rest transform on every edit. */
  private arrivingFloorY = 0;
  /** The arriving actor's entrance frames, in order. */
  private readonly appearFrames: readonly CharacterAssetRef[];
  /**
   * Pose held once the entrance finishes. The character's discovered idle,
   * which is what the previous hardcoded "stay" frame was.
   */
  private readonly settledFrame: CharacterAssetRef;

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
    /**
     * Who is on the platform. Resolved by the caller through the character
     * and casting systems: this view renders whoever it is handed and makes
     * no casting decision of its own.
     */
    private readonly cast: ResolvedSceneCast,
    private readonly layout: DialogueStationLayoutConfig = DEFAULT_STATION_LAYOUT,
    /**
     * Extra width this view renders past the panel's own logical width, so
     * the station keeps covering the ground underneath the diagonal divider
     * (which drifts right toward the bottom) instead of leaving a black wedge
     * between the panel's vertical edge and the divider's left edge.
     *
     * Only the *mask* is widened. The composition itself is never stretched,
     * duplicated or otherwise coerced to reach it — whatever of the real
     * station art naturally extends past the panel edge shows through, and
     * the divider drawn on top of it covers its own band regardless; the
     * seam is allowed to crop into the art rather than manufacture more of
     * it.
     */
    private readonly renderOverlap: number = 0,
  ) {
    // Read before any actor is built; capability validation upstream has
    // already guaranteed both are present for this cast.
    this.appearFrames = cast.arriving.dialogue.appear;
    this.settledFrame = cast.arriving.gameplay.idle ?? cast.arriving.dialogue.appear[0];

    const children: Phaser.GameObjects.GameObject[] = [];

    this.background = this.hasTexture(DIALOGUE_STATION_TEXTURE_KEYS.background)
      ? this.buildBackdropLayer(DIALOGUE_STATION_TEXTURE_KEYS.background, layout.background)
      : undefined;
    if (this.background) children.push(this.background);

    this.train = this.buildTrain();
    this.recomputeTrainDeparture();
    children.push(this.train);

    this.foreground = this.hasTexture(DIALOGUE_STATION_TEXTURE_KEYS.foreground)
      ? this.buildBackdropLayer(DIALOGUE_STATION_TEXTURE_KEYS.foreground, layout.foreground)
      : undefined;
    if (this.foreground) children.push(this.foreground);

    // Actors go last so both stay visible above first_plan_metro.
    this.seated = this.buildSeatedActor();
    children.push(this.seated);

    this.arriving = this.buildArrivingActor();
    children.push(this.arriving);
    this.recomputeArrivingFloor();

    this.content = scene.add.container(0, 0, children);
    this.root = scene.add.container(0, 0, [this.content]);
    this.mask = scene.make.graphics({}, false);
    this.root.setMask(this.mask.createGeometryMask());
    this.resize(width, height);
  }

  private hasTexture(key: string): boolean {
    return this.scene.textures.exists(key);
  }

  private nativeHeightOf(key: string, fallback: number): number {
    return this.hasTexture(key) ? this.scene.textures.get(key).getSourceImage().height : fallback;
  }

  private applyRestTransform(
    image: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
    entry: import('./dialogueStationLayout').StationObjectLayout,
    nativeHeight: number,
  ): void {
    const resolved = resolveStationTransform(
      entry,
      STATION_CANONICAL_WIDTH,
      STATION_CANONICAL_HEIGHT,
      nativeHeight,
    );
    image.setPosition(resolved.x, resolved.y).setScale(resolved.scale);
  }

  private buildBackdropLayer(
    key: string,
    entry: import('./dialogueStationLayout').StationObjectLayout,
  ): Phaser.GameObjects.Image {
    const image = this.scene.add.image(0, 0, key).setOrigin(0, 0);
    this.applyRestTransform(image, entry, this.nativeHeightOf(key, BACKDROP_NATIVE_HEIGHT_FALLBACK));
    return image;
  }

  private buildTrain(): Phaser.GameObjects.Image {
    const key = DIALOGUE_STATION_TEXTURE_KEYS.train;
    const image = this.scene.add.image(0, 0, key).setOrigin(0.5, 1);
    this.applyRestTransform(image, this.layout.train, this.nativeHeightOf(key, CHARACTER_CANVAS_HEIGHT));
    return image;
  }

  /** The seated actor, present for the whole scene. */
  /** Whoever the cast seats here; the renderer does not choose. */
  private buildSeatedActor(): Phaser.GameObjects.Image {
    const pose = this.cast.seated.dialogue.metroSit!;
    const image = this.scene.add.image(0, 0, pose.key).setOrigin(0.5, 1);
    this.applyRestTransform(image, this.layout.seated, CHARACTER_CANVAS_HEIGHT);
    return image;
  }

  /** The arriving actor, hidden until its entrance starts. Rest pose is its settled one. */
  private buildArrivingActor(): Phaser.GameObjects.Sprite {
    const sprite = this.scene.add
      .sprite(0, 0, this.appearFrames[0].key)
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.applyRestTransform(sprite, this.layout.arriving, CHARACTER_CANVAS_HEIGHT);
    return sprite;
  }

  /** Train's departure target follows its current rest position/scale, so editing it live stays correct. */
  private recomputeTrainDeparture(): void {
    this.trainDepartX = STATION_CANONICAL_WIDTH + this.train.displayWidth;
  }

  /** The floor line every appear-frame's foot gap is measured from, from the settled pose. */
  private recomputeArrivingFloor(): void {
    this.arrivingFloorY = this.arriving.y - footOffset(this.settledFrame.footGap, this.arriving.scaleY);
  }

  /**
   * Seats a frame on the shared floor line using its own discovered footGap,
   * so no character-specific table is needed here and none is re-measured at
   * runtime.
   */
  private floorForFrame(frame: CharacterAssetRef): number {
    return this.arrivingFloorY + footOffset(frame.footGap, this.arriving.scaleY);
  }

  /**
   * Refits the environment to a new panel size by covering it with the
   * canonical-box composition (one uniform scale, centred, cropping overflow
   * rather than leaving gaps) and repositions the mask to match.
   *
   * Background, foreground, train and both actors are children of the same
   * `content` container and were all positioned in the same canonical space
   * they share, so this single scale/position carries every one of them
   * together — none of them can drift relative to another, at any aspect
   * ratio the panel takes.
   *
   * The mask alone is widened by `renderOverlap` to reach under the diagonal
   * divider; the composition's own fit is computed against the real panel
   * size, never the widened one, so extending that coverage never rescales
   * or repositions the station. Whatever of the real art naturally reaches
   * past the panel edge (the background is wide relative to the canonical
   * box) shows through there; the divider painted on top covers its own
   * band regardless. No duplicate or stretched art is manufactured to
   * guarantee full coverage — the seam is allowed to crop into the station
   * instead.
   */
  resize(width: number, height: number): void {
    this.mask.clear().fillStyle(0xffffff).fillRect(0, 0, width + this.renderOverlap, height);
    const fit = computeCoverFit(STATION_CANONICAL_WIDTH, STATION_CANONICAL_HEIGHT, width, height);
    this.content.setScale(fit.scale).setPosition(fit.offsetX, fit.offsetY);
  }

  /**
   * Plays the departure/appearance sequence once the panels have finished
   * sliding in: the train sits, then leaves with acceleration; once it is
   * mostly offscreen, the arriving actor appears frame by frame and settles.
   * `onComplete` fires once it has finished appearing, so the caller can
   * gate the first dialogue line on it.
   */
  playArrival(onComplete: () => void): void {
    this.scene.time.delayedCall(STATIONARY_PAUSE_MS, () => {
      let arrivalTriggered = false;
      this.scene.tweens.add({
        targets: this.train,
        x: this.trainDepartX,
        duration: DEPART_DURATION_MS,
        // Starts slow and speeds up — an acceleration, not a constant slide.
        ease: 'Cubic.easeIn',
        onUpdate: (tween) => {
          if (arrivalTriggered || tween.progress < ARRIVAL_TRIGGER_PROGRESS) return;
          arrivalTriggered = true;
          this.playArrivalAnimation(onComplete);
        },
      });
    });
  }

  private playArrivalAnimation(onComplete: () => void): void {
    this.arriving.setVisible(true);
    let frameIndex = 0;
    const showFrame = (): void => {
      const frame = this.appearFrames[frameIndex];
      this.arriving.setTexture(frame.key);
      this.arriving.setY(this.floorForFrame(frame));
      frameIndex += 1;
      if (frameIndex < this.appearFrames.length) {
        this.scene.time.delayedCall(APPEAR_FRAME_DURATION_MS, showFrame);
        return;
      }
      this.scene.time.delayedCall(APPEAR_FRAME_DURATION_MS, () => {
        this.arriving.setTexture(this.settledFrame.key);
        this.arriving.setY(this.floorForFrame(this.settledFrame));
        onComplete();
      });
    };
    showFrame();
  }

  /**
   * Registers this scene's five objects with the dev-only generic
   * SceneEditor. Only meaningful in DEV builds; callers gate the import.
   */
  getEditableObjects(): EditableObject[] {
    const entries: { id: StationObjectKey; label: string; target?: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; nativeHeight: number; onChange?: (t: EditableTransform) => void }[] = [
      { id: 'background', label: 'background_metro', target: this.background, nativeHeight: this.nativeHeightOf(DIALOGUE_STATION_TEXTURE_KEYS.background, BACKDROP_NATIVE_HEIGHT_FALLBACK) },
      { id: 'train', label: 'train', target: this.train, nativeHeight: this.nativeHeightOf(DIALOGUE_STATION_TEXTURE_KEYS.train, CHARACTER_CANVAS_HEIGHT), onChange: () => this.recomputeTrainDeparture() },
      { id: 'foreground', label: 'first_plan_metro', target: this.foreground, nativeHeight: this.nativeHeightOf(DIALOGUE_STATION_TEXTURE_KEYS.foreground, BACKDROP_NATIVE_HEIGHT_FALLBACK) },
      { id: 'seated', label: 'Seated actor', target: this.seated, nativeHeight: CHARACTER_CANVAS_HEIGHT },
      { id: 'arriving', label: 'Arriving actor', target: this.arriving, nativeHeight: CHARACTER_CANVAS_HEIGHT, onChange: () => this.recomputeArrivingFloor() },
    ];
    return entries
      .filter((entry): entry is typeof entry & { target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite } => entry.target !== undefined)
      .map((entry) => ({
        id: entry.id,
        target: entry.target,
        label: entry.label,
        getNativeSize: () => ({ width: entry.target.width, height: entry.nativeHeight }),
        onChange: entry.onChange,
      }));
  }

  /** Converts the editor's absolute-pixel snapshot back into the panel-relative ratio config it saves. */
  buildLayoutFromSnapshot(
    snapshot: readonly { id: string; x: number; y: number; scaleX: number; scaleY: number }[],
  ): DialogueStationLayoutConfig {
    const heightById: Record<StationObjectKey, number> = {
      background: this.nativeHeightOf(DIALOGUE_STATION_TEXTURE_KEYS.background, BACKDROP_NATIVE_HEIGHT_FALLBACK),
      train: this.nativeHeightOf(DIALOGUE_STATION_TEXTURE_KEYS.train, CHARACTER_CANVAS_HEIGHT),
      foreground: this.nativeHeightOf(DIALOGUE_STATION_TEXTURE_KEYS.foreground, BACKDROP_NATIVE_HEIGHT_FALLBACK),
      seated: CHARACTER_CANVAS_HEIGHT,
      arriving: CHARACTER_CANVAS_HEIGHT,
    };
    const next: DialogueStationLayoutConfig = structuredClone(this.layout);
    for (const entry of snapshot) {
      const id = entry.id as StationObjectKey;
      if (!(id in heightById)) continue;
      next[id] = toStationObjectLayout(
        { x: entry.x, y: entry.y, scale: entry.scaleY },
        STATION_CANONICAL_WIDTH,
        STATION_CANONICAL_HEIGHT,
        heightById[id],
      );
    }
    return next;
  }

  /** Keeps the mask tracking the panel's current on-screen position (a
   * GeometryMask follows its own graphics object, not the container it
   * masks, so this has to run every frame the panel moves). */
  update(): void {
    this.mask.setPosition(this.root.x, this.root.y);
  }

  destroy(): void {
    this.root.clearMask(true);
    this.mask.destroy();
    this.root.destroy(true);
  }
}
