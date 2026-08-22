import Phaser from 'phaser';
import type { EditableObject, EditableTransform } from '../systems/SceneEditor';
import { computeCoverFit } from './dialogueLayoutMetrics';
import {
  DEFAULT_STATION_LAYOUT,
  resolveStationTransform,
  toStationObjectLayout,
  type DialogueStationLayoutConfig,
  type StationObjectKey,
} from './dialogueStationLayout';
import {
  ATMOS_SIT_METRO_KEY,
  DISUS_APPEAR_FRAME_KEYS,
  DISUS_STAY_KEY,
  DIALOGUE_STATION_TEXTURE_KEYS,
} from './stationAssets';

/** Seconds the train sits still before it departs. */
const STATIONARY_PAUSE_MS = 600;
/** How long the departure takes; the tween's own easing supplies the accel. */
const DEPART_DURATION_MS = 2200;
/** Fraction of the departure travelled before the train reads as "mostly gone". */
const DISUS_TRIGGER_PROGRESS = 0.82;
/** Within the requested 80-100ms/frame window. */
const DISUS_FRAME_DURATION_MS = 90;

/** Native canvas size shared by every Atmos/Disus dialogue frame. */
const CHARACTER_CANVAS_HEIGHT = 184;

/**
 * Transparent padding below the drawn figure in each frame, so every frame's
 * feet land on the same floor line regardless of how much of the canvas that
 * frame's artwork fills (mirrors ATMOS_FRAME_FOOT_GAPS in entities/atmosFrames).
 */
const DISUS_APPEAR_FOOT_GAPS: Record<(typeof DISUS_APPEAR_FRAME_KEYS)[number], number> = {
  'disus-appear-1': 79,
  'disus-appear-2': 43,
  'disus-appear-3': 12,
  'disus-appear-4': 0,
  'disus-appear-5': 1,
  'disus-appear-6': 5,
  'disus-appear-7': 3,
  'disus-appear-8': 9,
  'disus-appear-9': 15,
};
const DISUS_STAY_FOOT_GAP = 21;

/** Frame name for the 1px right-edge column used by the backdrop bleed. */
const BLEED_FRAME_KEY = 'metro-background-bleed';

/** background/foreground share the same source art, so 1px = 1px between the two. */
const BACKDROP_NATIVE_HEIGHT_FALLBACK = 887;

/**
 * The left-hand panel for Dialogue 1: a metro platform where a train departs
 * and Disus appears once it has mostly left.
 *
 * Layers, back to front: background_metro, the train, first_plan_metro, then
 * the characters (Atmos seated, Disus once revealed) on top, so both stay
 * visible over the foreground art. Everything is laid out once against the
 * panel's first-layout ("reference") size; `resize()` uniformly covers
 * whatever the panel's current size is, so the departure/appearance sequence
 * never has to be rebuilt or reset mid-animation.
 *
 * Every object's *rest pose* (position + scale) comes from
 * `dialogueStationLayout.ts`/`dialogueStationLayout.json` rather than
 * hardcoded numbers, and is editable at runtime via `getEditableObjects()`
 * (see DialogueScene's dev-only SceneEditor wiring). Train departure and
 * Disus's per-frame foot alignment are *derived* from that rest pose each
 * time it changes, so editing it live can't desync the animations.
 */
export class StationSceneView {
  readonly root: Phaser.GameObjects.Container;
  private readonly content: Phaser.GameObjects.Container;
  private readonly background?: Phaser.GameObjects.Image;
  private readonly train: Phaser.GameObjects.Image;
  private readonly foreground?: Phaser.GameObjects.Image;
  private readonly atmos: Phaser.GameObjects.Image;
  private readonly disus: Phaser.GameObjects.Sprite;
  private readonly mask: Phaser.GameObjects.Graphics;
  private referenceWidth: number;
  private referenceHeight: number;
  /** Recomputed from the train's current rest transform on every edit. */
  private trainDepartX = 0;
  /** Recomputed from Disus's current (stay-pose) rest transform on every edit. */
  private disusFloorY = 0;
  /**
   * Smear of the background's rightmost pixel column, filling the strip
   * between where the background art ends and the far edge of the masked
   * render area. See `updateBleed`.
   */
  private readonly bleed?: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
    private readonly layout: DialogueStationLayoutConfig = DEFAULT_STATION_LAYOUT,
    /**
     * Extra width this view renders past the panel's own logical width, so
     * the station keeps covering the ground underneath the diagonal divider
     * (which drifts right toward the bottom) instead of leaving a black wedge
     * between the panel's vertical edge and the divider's left edge.
     *
     * Only *coverage* is extended: the panel's logical width still drives the
     * cover-fit composition and every authored rest pose, so the train and
     * the characters sit exactly where they would with no overlap at all.
     */
    private readonly renderOverlap: number = 0,
  ) {
    this.referenceWidth = width;
    this.referenceHeight = height;

    const children: Phaser.GameObjects.GameObject[] = [];

    this.background = this.hasTexture(DIALOGUE_STATION_TEXTURE_KEYS.background)
      ? this.buildBackdropLayer(DIALOGUE_STATION_TEXTURE_KEYS.background, layout.background)
      : undefined;
    if (this.background) children.push(this.background);

    // Sits directly on top of the background and behind everything else, so
    // it can only ever fill space the background itself does not reach.
    this.bleed = this.background ? this.buildBleed() : undefined;
    if (this.bleed) children.push(this.bleed);

    this.train = this.buildTrain();
    this.recomputeTrainDeparture();
    children.push(this.train);

    this.foreground = this.hasTexture(DIALOGUE_STATION_TEXTURE_KEYS.foreground)
      ? this.buildBackdropLayer(DIALOGUE_STATION_TEXTURE_KEYS.foreground, layout.foreground)
      : undefined;
    if (this.foreground) children.push(this.foreground);

    // Characters go last so Atmos and Disus stay visible above first_plan_metro.
    this.atmos = this.buildAtmos();
    children.push(this.atmos);

    this.disus = this.buildDisus();
    children.push(this.disus);
    this.recomputeDisusFloor();

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
    const resolved = resolveStationTransform(entry, this.referenceWidth, this.referenceHeight, nativeHeight);
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

  /**
   * A 1px-wide frame cut from the right edge of the background texture, drawn
   * stretched across whatever strip the background does not reach. Because the
   * source is a single column, stretching it produces a continuation of the
   * edge rather than a distorted copy of the artwork.
   */
  private buildBleed(): Phaser.GameObjects.Image | undefined {
    const key = DIALOGUE_STATION_TEXTURE_KEYS.background;
    const texture = this.scene.textures.get(key);
    if (!texture.has(BLEED_FRAME_KEY)) {
      const source = texture.getSourceImage();
      if (source.width < 1 || source.height < 1) return undefined;
      texture.add(BLEED_FRAME_KEY, 0, source.width - 1, 0, 1, source.height);
    }
    return this.scene.add.image(0, 0, key, BLEED_FRAME_KEY).setOrigin(0, 0).setVisible(false);
  }

  private buildTrain(): Phaser.GameObjects.Image {
    const key = DIALOGUE_STATION_TEXTURE_KEYS.train;
    const image = this.scene.add.image(0, 0, key).setOrigin(0.5, 1);
    this.applyRestTransform(image, this.layout.train, this.nativeHeightOf(key, CHARACTER_CANVAS_HEIGHT));
    return image;
  }

  /** Atmos, seated for the whole scene. */
  private buildAtmos(): Phaser.GameObjects.Image {
    const image = this.scene.add.image(0, 0, ATMOS_SIT_METRO_KEY).setOrigin(0.5, 1);
    this.applyRestTransform(image, this.layout.atmos, CHARACTER_CANVAS_HEIGHT);
    return image;
  }

  /** Disus, hidden until the appearing sequence starts. Rest pose is its `stay` pose. */
  private buildDisus(): Phaser.GameObjects.Sprite {
    const sprite = this.scene.add
      .sprite(0, 0, DISUS_APPEAR_FRAME_KEYS[0])
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.applyRestTransform(sprite, this.layout.disus, CHARACTER_CANVAS_HEIGHT);
    return sprite;
  }

  /** Train's departure target follows its current rest position/scale, so editing it live stays correct. */
  private recomputeTrainDeparture(): void {
    this.trainDepartX = this.referenceWidth + this.train.displayWidth;
  }

  /** The floor line every Disus appear-frame's foot gap is measured from, derived from its stay pose. */
  private recomputeDisusFloor(): void {
    this.disusFloorY = this.disus.y - DISUS_STAY_FOOT_GAP * this.disus.scaleY;
  }

  private floorForFrame(
    key: (typeof DISUS_APPEAR_FRAME_KEYS)[number] | typeof DISUS_STAY_KEY,
  ): number {
    const gap = key === DISUS_STAY_KEY ? DISUS_STAY_FOOT_GAP : DISUS_APPEAR_FOOT_GAPS[key];
    return this.disusFloorY + gap * this.disus.scaleY;
  }

  /**
   * Refits the environment to a new panel size by covering it with the
   * reference-box composition (uniform scale, centred, cropping overflow
   * rather than leaving gaps) and repositions the mask to match.
   */
  resize(width: number, height: number): void {
    const renderWidth = width + this.renderOverlap;
    this.mask.clear().fillStyle(0xffffff).fillRect(0, 0, renderWidth, height);
    // Cover-fit targets the *logical* panel box, so the composition — and with
    // it every authored object transform — is identical with or without the
    // overlap. Nothing below touches the station artwork itself.
    const fit = computeCoverFit(this.referenceWidth, this.referenceHeight, width, height);
    this.content.setScale(fit.scale).setPosition(fit.offsetX, fit.offsetY);
    if (fit.scale > 0) this.updateBleed((renderWidth - fit.offsetX) / fit.scale);
  }

  /**
   * Fills the strip between the right edge of the background art and
   * `localRight` (the far edge of the masked render area, in `content`-local
   * pixels) by smearing the background's own edge column across it.
   *
   * The station artwork is never scaled or moved to reach the seam. Doing that
   * — uniformly or on one axis — changes the background/foreground geometry
   * independently of Atmos, Disus and the train, which keep their authored
   * transforms, and so breaks the authored composition on exactly the wide
   * mobile layouts where the coverage engages. The bleed is additive instead:
   * it only ever paints where the background does not reach, so the
   * composition is bit-identical to desktop at every viewport.
   *
   * Read live from the background's current transform, so a dev-editor edit
   * to the background is followed automatically. Only the background needs
   * this: the foreground is transparent art layered on top, so where it ends
   * the background (and this bleed) still show through.
   */
  private updateBleed(localRight: number): void {
    const background = this.background;
    const bleed = this.bleed;
    if (!background || !bleed) return;
    const right = background.x + background.displayWidth;
    const gap = localRight - right;
    if (gap <= 0) {
      bleed.setVisible(false);
      return;
    }
    bleed
      .setVisible(true)
      .setPosition(right, background.y)
      .setDisplaySize(gap, background.displayHeight);
  }

  /**
   * Plays the departure/appearance sequence once the panels have finished
   * sliding in: the train sits, then leaves with acceleration; once it is
   * mostly offscreen, Disus appears frame by frame and settles on `stay`.
   * `onComplete` fires once Disus has finished appearing, so the caller can
   * gate the first dialogue line on it.
   */
  playArrival(onComplete: () => void): void {
    this.scene.time.delayedCall(STATIONARY_PAUSE_MS, () => {
      let disusTriggered = false;
      this.scene.tweens.add({
        targets: this.train,
        x: this.trainDepartX,
        duration: DEPART_DURATION_MS,
        // Starts slow and speeds up — an acceleration, not a constant slide.
        ease: 'Cubic.easeIn',
        onUpdate: (tween) => {
          if (disusTriggered || tween.progress < DISUS_TRIGGER_PROGRESS) return;
          disusTriggered = true;
          this.playDisusAppearance(onComplete);
        },
      });
    });
  }

  private playDisusAppearance(onComplete: () => void): void {
    this.disus.setVisible(true);
    let frameIndex = 0;
    const showFrame = (): void => {
      const key = DISUS_APPEAR_FRAME_KEYS[frameIndex];
      this.disus.setTexture(key);
      this.disus.setY(this.floorForFrame(key));
      frameIndex += 1;
      if (frameIndex < DISUS_APPEAR_FRAME_KEYS.length) {
        this.scene.time.delayedCall(DISUS_FRAME_DURATION_MS, showFrame);
        return;
      }
      this.scene.time.delayedCall(DISUS_FRAME_DURATION_MS, () => {
        this.disus.setTexture(DISUS_STAY_KEY);
        this.disus.setY(this.floorForFrame(DISUS_STAY_KEY));
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
      { id: 'atmos', label: 'Atmos', target: this.atmos, nativeHeight: CHARACTER_CANVAS_HEIGHT },
      { id: 'disus', label: 'Disus', target: this.disus, nativeHeight: CHARACTER_CANVAS_HEIGHT, onChange: () => this.recomputeDisusFloor() },
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
      atmos: CHARACTER_CANVAS_HEIGHT,
      disus: CHARACTER_CANVAS_HEIGHT,
    };
    const next: DialogueStationLayoutConfig = structuredClone(this.layout);
    for (const entry of snapshot) {
      const id = entry.id as StationObjectKey;
      if (!(id in heightById)) continue;
      next[id] = toStationObjectLayout(
        { x: entry.x, y: entry.y, scale: entry.scaleY },
        this.referenceWidth,
        this.referenceHeight,
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
