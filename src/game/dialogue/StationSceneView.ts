import Phaser from 'phaser';
import { computeCoverFit } from './dialogueLayoutMetrics';
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

/** Fraction of the reference panel height a seated/standing figure renders at. */
const CHARACTER_HEIGHT_RATIO = 0.4;
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
const ATMOS_SIT_FOOT_GAP = 13;

/**
 * The left-hand panel for Dialogue 1: a metro platform where a train departs
 * and Disus appears once it has mostly left.
 *
 * Layers, back to front: background_metro, the train, the characters (Atmos
 * seated, Disus once revealed), then first_plan_metro on top. Everything is
 * laid out once against the panel's first-layout ("reference") size; `resize()`
 * uniformly covers whatever the panel's current size is, so the departure/
 * appearance sequence never has to be rebuilt or reset mid-animation.
 */
export class StationSceneView {
  readonly root: Phaser.GameObjects.Container;
  private readonly content: Phaser.GameObjects.Container;
  private readonly train: Phaser.GameObjects.Image;
  private readonly disus: Phaser.GameObjects.Sprite;
  private readonly mask: Phaser.GameObjects.Graphics;
  private readonly referenceWidth: number;
  private readonly referenceHeight: number;
  private readonly floorY: number;
  private readonly trainRestX: number;
  private readonly trainDepartX: number;
  private readonly disusX: number;
  private readonly characterScale: number;

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
  ) {
    this.referenceWidth = width;
    this.referenceHeight = height;
    this.floorY = height * 0.88;
    this.characterScale = (height * CHARACTER_HEIGHT_RATIO) / CHARACTER_CANVAS_HEIGHT;

    const children: Phaser.GameObjects.GameObject[] = [];

    const backdropFit = this.hasTexture(DIALOGUE_STATION_TEXTURE_KEYS.background)
      ? this.buildBackdropLayer(DIALOGUE_STATION_TEXTURE_KEYS.background)
      : undefined;
    if (backdropFit) children.push(backdropFit.image);

    this.train = this.buildTrain();
    this.trainRestX = width * 0.5;
    const trainDisplayWidth = this.train.displayWidth;
    this.trainDepartX = width + trainDisplayWidth;
    this.train.setPosition(this.trainRestX, this.floorY);
    children.push(this.train);

    const atmos = this.buildAtmos();
    this.disusX = width * 0.68;
    children.push(atmos);

    this.disus = this.buildDisus();
    children.push(this.disus);

    if (backdropFit && this.hasTexture(DIALOGUE_STATION_TEXTURE_KEYS.foreground)) {
      const foreground = scene.add
        .image(0, 0, DIALOGUE_STATION_TEXTURE_KEYS.foreground)
        .setOrigin(0, 0)
        .setScale(backdropFit.scale)
        .setPosition(backdropFit.offsetX, backdropFit.offsetY);
      children.push(foreground);
    }

    this.content = scene.add.container(0, 0, children);
    this.root = scene.add.container(0, 0, [this.content]);
    this.mask = scene.make.graphics({}, false);
    this.root.setMask(this.mask.createGeometryMask());
    this.resize(width, height);
  }

  private hasTexture(key: string): boolean {
    return this.scene.textures.exists(key);
  }

  private buildBackdropLayer(
    key: string,
  ): { image: Phaser.GameObjects.Image; scale: number; offsetX: number; offsetY: number } {
    const source = this.scene.textures.get(key).getSourceImage();
    const fit = computeCoverFit(source.width, source.height, this.referenceWidth, this.referenceHeight);
    const image = this.scene.add
      .image(0, 0, key)
      .setOrigin(0, 0)
      .setScale(fit.scale)
      .setPosition(fit.offsetX, fit.offsetY);
    return { image, ...fit };
  }

  private buildTrain(): Phaser.GameObjects.Image {
    const key = DIALOGUE_STATION_TEXTURE_KEYS.train;
    const image = this.scene.add.image(0, 0, key).setOrigin(0.5, 1);
    if (this.hasTexture(key)) {
      const source = this.scene.textures.get(key).getSourceImage();
      const targetHeight = this.referenceHeight * 0.5;
      image.setScale(targetHeight / source.height);
    }
    return image;
  }

  /** Atmos, seated for the whole scene. */
  private buildAtmos(): Phaser.GameObjects.Image {
    const x = this.referenceWidth * 0.24;
    const key = ATMOS_SIT_METRO_KEY;
    return this.scene.add
      .image(x, this.floorY + ATMOS_SIT_FOOT_GAP * this.characterScale, key)
      .setOrigin(0.5, 1)
      .setScale(this.characterScale);
  }

  /** Disus, hidden until the appearing sequence starts. */
  private buildDisus(): Phaser.GameObjects.Sprite {
    const firstKey = DISUS_APPEAR_FRAME_KEYS[0];
    return this.scene.add
      .sprite(this.disusX, this.floorForFrame(firstKey), firstKey)
      .setOrigin(0.5, 1)
      .setScale(this.characterScale)
      .setVisible(false);
  }

  private floorForFrame(
    key: (typeof DISUS_APPEAR_FRAME_KEYS)[number] | typeof DISUS_STAY_KEY,
  ): number {
    const gap = key === DISUS_STAY_KEY ? DISUS_STAY_FOOT_GAP : DISUS_APPEAR_FOOT_GAPS[key];
    return this.floorY + gap * this.characterScale;
  }

  /**
   * Refits the environment to a new panel size by covering it with the
   * reference-box composition (uniform scale, centred, cropping overflow
   * rather than leaving gaps) and repositions the mask to match.
   */
  resize(width: number, height: number): void {
    this.mask.clear().fillStyle(0xffffff).fillRect(0, 0, width, height);
    const fit = computeCoverFit(this.referenceWidth, this.referenceHeight, width, height);
    this.content.setScale(fit.scale).setPosition(fit.offsetX, fit.offsetY);
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
