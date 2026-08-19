import Phaser from 'phaser';
import { ATMOS_RUN_STATIC_FRAME_KEY, ATMOS_VISUAL_SCALE, getAtmosFootOffset } from '../entities/atmosFrames';
import { computeCoverFit } from './dialogueLayoutMetrics';

/**
 * The left-hand panel: Atmos waiting on a metro platform when a green cloud
 * rolls in and the Magician steps out of it.
 *
 * Built from textures BootScene already loads plus primitives, so this scene
 * adds no new assets. All the environment art is laid out once against the
 * panel's first-layout size (its "reference" box); `resize()` then uniformly
 * covers whatever the panel's current size is, so the composition and the
 * cloud/arrival animation never have to be rebuilt or reset.
 */
export class StationSceneView {
  readonly root: Phaser.GameObjects.Container;
  /** Everything drawn at reference-box coordinates; scaled to cover by resize(). */
  private readonly content: Phaser.GameObjects.Container;
  private readonly cloud: Phaser.GameObjects.Graphics;
  private readonly magicianShape: Phaser.GameObjects.Container;
  private readonly mask: Phaser.GameObjects.Graphics;
  private readonly referenceWidth: number;
  private readonly referenceHeight: number;
  private readonly platformY: number;

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
  ) {
    this.referenceWidth = width;
    this.referenceHeight = height;
    this.platformY = height * 0.82;
    const children: Phaser.GameObjects.GameObject[] = [];

    children.push(scene.add.rectangle(0, 0, width, height, 0x0d0a16).setOrigin(0, 0));
    // Reuse the Berlin railway backdrop when it is in the cache; the dialogue
    // must still compose if a dev boots this scene on its own.
    if (scene.textures.exists('berlin-railway')) {
      const railway = scene.add
        .image(width / 2, height * 0.46, 'berlin-railway')
        .setOrigin(0.5)
        .setAlpha(0.5);
      const fit = Math.max(width / railway.width, (height * 0.7) / railway.height);
      railway.setScale(fit);
      children.push(railway);
    }
    if (scene.textures.exists('berlin-train-left')) {
      const train = scene.add
        .image(width * 0.5, this.platformY - 8, 'berlin-train-left')
        .setOrigin(0.5, 1)
        .setAlpha(0.85);
      train.setScale(Math.min(1, (width * 0.95) / train.width));
      children.push(train);
    }

    children.push(...this.buildPlatform(width, height));
    children.push(this.buildHero(width));

    this.cloud = scene.add.graphics();
    this.magicianShape = this.buildMagicianSilhouette(width);
    children.push(this.cloud, this.magicianShape);

    this.content = scene.add.container(0, 0, children);
    this.root = scene.add.container(0, 0, [this.content]);
    this.mask = scene.make.graphics({}, false);
    this.root.setMask(this.mask.createGeometryMask());
    this.resize(width, height);
  }

  private buildPlatform(width: number, height: number): Phaser.GameObjects.GameObject[] {
    const platform = this.scene.add
      .rectangle(0, this.platformY, width, height - this.platformY, 0x1c1230)
      .setOrigin(0, 0);
    const edge = this.scene.add
      .rectangle(0, this.platformY, width, 6, 0xffdf57, 0.75)
      .setOrigin(0, 0);
    const pillars: Phaser.GameObjects.GameObject[] = [];
    for (let index = 0; index < 3; index += 1) {
      pillars.push(
        this.scene.add
          .rectangle(60 + index * (width / 3), this.platformY, 26, -height * 0.5, 0x150e24)
          .setOrigin(0.5, 1)
          .setAlpha(0.9),
      );
    }
    // Cold platform lighting, so the green cloud reads as foreign.
    const lamp = this.scene.add
      .rectangle(width * 0.24, this.platformY - height * 0.42, 90, 10, 0x9fd8ff, 0.5)
      .setOrigin(0.5);
    return [platform, edge, ...pillars, lamp];
  }

  /** Atmos, using the same shared frame and floor alignment as the levels. */
  private buildHero(width: number): Phaser.GameObjects.GameObject {
    const key = this.scene.textures.exists(ATMOS_RUN_STATIC_FRAME_KEY)
      ? ATMOS_RUN_STATIC_FRAME_KEY
      : undefined;
    if (!key) {
      return this.scene.add
        .rectangle(width * 0.3, this.platformY, 60, 150, 0xffc74e)
        .setOrigin(0.5, 1);
    }
    return this.scene.add
      .sprite(width * 0.3, this.platformY + getAtmosFootOffset(key), key)
      .setOrigin(0.5, 1)
      .setScale(ATMOS_VISUAL_SCALE * 0.9);
  }

  private buildMagicianSilhouette(width: number): Phaser.GameObjects.Container {
    const x = width * 0.68;
    const robe = this.scene.add
      .triangle(0, 0, 0, 0, -66, -150, 66, -150, 0x0f2a1c)
      .setStrokeStyle(3, 0x7cff9b, 0.85);
    const head = this.scene.add.ellipse(0, -168, 52, 60, 0x0f2a1c).setStrokeStyle(3, 0x7cff9b, 0.85);
    const hat = this.scene.add
      .triangle(0, -196, 0, 0, -40, -86, 40, -86, 0x0b2216)
      .setStrokeStyle(3, 0x7cff9b, 0.7);
    const eyes = this.scene.add.ellipse(0, -172, 30, 8, 0xd8ff5c);
    return this.scene.add
      .container(x, this.platformY, [robe, head, hat, eyes])
      .setAlpha(0)
      .setScale(1, 0.2);
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
   * Plays the arrival: the cloud swells, then the Magician rises out of it.
   * Runs once when the panels finish sliding in.
   */
  playArrival(): void {
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 900,
      ease: 'Quad.easeOut',
      onUpdate: (tween) => this.setCloudProgress(tween.getValue() ?? 0),
    });
    this.scene.tweens.add({
      targets: this.magicianShape,
      alpha: 1,
      scaleY: 1,
      y: this.platformY,
      duration: 620,
      delay: 420,
      ease: 'Back.easeOut',
    });
  }

  private cloudProgress = 0;

  private setCloudProgress(progress: number): void {
    this.cloudProgress = progress;
  }

  /**
   * Keeps the cloud roiling for as long as the dialogue is on screen, and
   * keeps the mask tracking the panel's current on-screen position (a
   * GeometryMask follows its own graphics object, not the container it
   * masks, so this has to run every frame the panel moves).
   */
  update(nowMs: number): void {
    this.mask.setPosition(this.root.x, this.root.y);
    this.cloud.clear();
    if (this.cloudProgress <= 0) return;
    const centerX = this.referenceWidth * 0.68;
    const centerY = this.platformY - 70;
    const scale = this.cloudProgress;
    for (let index = 0; index < 11; index += 1) {
      const angle = (index / 11) * Math.PI * 2 + nowMs / 2600;
      const radius = (66 + Math.sin(nowMs / 420 + index) * 20) * scale;
      const puffX = centerX + Math.cos(angle) * 78 * scale;
      const puffY = centerY + Math.sin(angle) * 42 * scale;
      this.cloud.fillStyle(index % 2 === 0 ? 0x2f9c5a : 0x7cff9b, 0.2);
      this.cloud.fillCircle(puffX, puffY, radius);
    }
    this.cloud.fillStyle(0xd8ff5c, 0.14);
    this.cloud.fillCircle(centerX, centerY, 84 * scale);
  }

  destroy(): void {
    this.root.clearMask(true);
    this.mask.destroy();
    this.root.destroy(true);
  }
}
