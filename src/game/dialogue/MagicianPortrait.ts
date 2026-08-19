import Phaser from 'phaser';
import { DialogueLayout } from './dialogueConstants';
import { buildPortraitClipPoints, computeContainFit } from './dialogueLayoutMetrics';

/**
 * The right-hand portrait panel: an animated green/cyan/yellow-green light
 * gradient with the Magician over it.
 *
 * The portrait is drawn procedurally because no Magician art exists yet. It is
 * isolated here so dropping in a real sprite later means replacing only
 * `buildPortrait()` — the gradient, panel and slide animation are untouched.
 *
 * The figure is built once against the panel's first-layout size (its
 * "reference" box) using fractional coordinates, then `resize()` rescales and
 * repositions that whole composition to fill most of whatever the panel's
 * current size is — so a viewport change never has to rebuild the drawing.
 */
export class MagicianPortrait {
  readonly root: Phaser.GameObjects.Container;
  private readonly gradient: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly noise: Phaser.GameObjects.Graphics;
  private readonly portrait: Phaser.GameObjects.Container;
  private readonly mask: Phaser.GameObjects.Graphics;
  private readonly referenceWidth: number;
  private readonly referenceHeight: number;
  private width: number;
  private height: number;
  /** Resting Y from the last fit; the idle breath offsets around this. */
  private portraitBaseY = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
  ) {
    this.referenceWidth = width;
    this.referenceHeight = height;
    this.width = width;
    this.height = height;

    this.gradient = scene.add.graphics();
    this.glow = scene.add.graphics();
    this.noise = scene.add.graphics();
    this.portrait = this.buildPortrait();
    this.root = scene.add.container(0, 0, [
      this.gradient,
      this.glow,
      this.portrait,
      this.noise,
    ]);

    // Keep the moving light strictly inside the panel; repositioned in
    // `resize()` since a GeometryMask tracks its own graphics object, not the
    // masked container.
    this.mask = scene.make.graphics({}, false);
    this.root.setMask(this.mask.createGeometryMask());
    this.resize(width, height);
  }

  /**
   * Replace this method to swap the placeholder for real Magician art. Uses
   * fractions of the reference box so the whole figure sits inside it (with a
   * little headroom for the hat) and scales cleanly in `resize()`.
   */
  private buildPortrait(): Phaser.GameObjects.Container {
    const w = this.referenceWidth;
    const h = this.referenceHeight;
    const centerX = w / 2;
    const footY = h * 0.97;
    const figureHeight = h * 0.86;
    const collarY = footY - figureHeight * 0.55;
    const headY = footY - figureHeight * 0.7;
    const hatBrimY = footY - figureHeight * 0.82;
    const hatTipY = footY - figureHeight;

    const robe = this.scene.add
      .triangle(centerX, footY, 0, 0, -w * 0.27, collarY - footY, w * 0.27, collarY - footY, 0x140a22, 0.96)
      .setStrokeStyle(4, 0x0a2f1c, 0.9);
    const collar = this.scene.add
      .triangle(centerX, collarY, 0, 0, -w * 0.17, headY - collarY, w * 0.17, headY - collarY, 0x1d0f2e)
      .setStrokeStyle(3, 0x7cff9b, 0.55);
    const head = this.scene.add
      .ellipse(centerX, headY, w * 0.23, figureHeight * 0.19, 0x1a1026)
      .setStrokeStyle(4, 0x0a2f1c, 0.9);
    const hatBrim = this.scene.add.ellipse(centerX, hatBrimY, w * 0.44, figureHeight * 0.045, 0x120a1e);
    const hat = this.scene.add
      .triangle(centerX, hatBrimY, 0, 0, -w * 0.14, hatTipY - hatBrimY, w * 0.14, hatTipY - hatBrimY, 0x120a1e)
      .setStrokeStyle(3, 0x7cff9b, 0.4);
    // Eyes are the only bright feature, so the face reads at a glance.
    const eyeOffsetX = w * 0.06;
    const eyeY = headY - figureHeight * 0.01;
    const leftEye = this.scene.add.ellipse(centerX - eyeOffsetX, eyeY, w * 0.046, figureHeight * 0.017, 0xd8ff5c);
    const rightEye = this.scene.add.ellipse(centerX + eyeOffsetX, eyeY, w * 0.046, figureHeight * 0.017, 0xd8ff5c);
    const grin = this.scene.add.graphics();
    grin.lineStyle(4, 0x7cff9b, 0.9);
    grin.beginPath();
    grin.arc(centerX, headY + figureHeight * 0.055, w * 0.06, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160));
    grin.strokePath();

    this.scene.tweens.add({
      targets: [leftEye, rightEye],
      scaleY: { from: 1, to: 0.25 },
      duration: 140,
      yoyo: true,
      repeatDelay: 2600,
      repeat: -1,
    });

    return this.scene.add.container(0, 0, [
      robe,
      collar,
      hatBrim,
      hat,
      head,
      leftEye,
      rightEye,
      grin,
    ]);
  }

  /**
   * Refits the composition to a new panel size: the gradient/glow/noise
   * redraw every frame against the live panel size directly, while the
   * Magician figure is a fixed drawing that gets uniformly rescaled to keep
   * filling most of the panel without distorting its proportions.
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    // Clip to the diagonal, not a plain rectangle: the panel's own box starts
    // at the divider's top-left, but at the bottom the seam has drifted right
    // by `dividerSkew`, and everything left of it there belongs to the scene.
    const clip = buildPortraitClipPoints(
      width,
      height,
      DialogueLayout.dividerThickness,
      DialogueLayout.dividerSkew,
    );
    this.mask.clear().fillStyle(0xffffff);
    const points: Phaser.Geom.Point[] = [];
    for (let index = 0; index < clip.length; index += 2) {
      points.push(new Phaser.Geom.Point(clip[index], clip[index + 1]));
    }
    this.mask.fillPoints(points, true);

    const fit = computeContainFit(
      this.referenceWidth,
      this.referenceHeight,
      width,
      height,
      DialogueLayout.portraitFillRatio,
    );
    this.portraitBaseY = fit.offsetY;
    this.portrait.setScale(fit.scale).setPosition(fit.offsetX, fit.offsetY);
  }

  /**
   * Redraws the moving light and keeps the mask tracking the panel's current
   * on-screen position (a GeometryMask follows its own graphics object, not
   * the container it masks, so this has to run every frame the panel moves).
   */
  update(nowMs: number): void {
    this.mask.setPosition(this.root.x, this.root.y);
    this.drawGradient(nowMs);
    this.drawGlow(nowMs);
    this.drawNoise(nowMs);
    // A slow breath keeps the figure from reading as a static cut-out.
    this.portrait.y = this.portraitBaseY + Math.sin(nowMs / 900) * 6;
  }

  /**
   * Horizontal bands whose colours drift between green, cyan and yellow-green.
   * Bands are coarse on purpose: cheap to redraw and it keeps the portrait
   * silhouette readable against the light.
   */
  private drawGradient(nowMs: number): void {
    this.gradient.clear();
    const bandHeight = 14;
    const bands = Math.ceil(this.height / bandHeight);
    for (let index = 0; index < bands; index += 1) {
      const t = index / bands;
      // Two offset waves make the light travel rather than merely pulse.
      const wave = Math.sin(t * 5.2 + nowMs / 620) * 0.5 + 0.5;
      const drift = Math.sin(t * 2.4 - nowMs / 940) * 0.5 + 0.5;
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        // Deep green -> cyan, then blended toward yellow-green by `drift`.
        new Phaser.Display.Color(10, 92, 54),
        new Phaser.Display.Color(64, 226, 200),
        100,
        wave * 100,
      );
      const highlight = Phaser.Display.Color.Interpolate.ColorWithColor(
        new Phaser.Display.Color(color.r, color.g, color.b),
        new Phaser.Display.Color(186, 240, 78),
        100,
        drift * 62,
      );
      this.gradient.fillStyle(
        Phaser.Display.Color.GetColor(highlight.r, highlight.g, highlight.b),
        1,
      );
      this.gradient.fillRect(0, index * bandHeight, this.width, bandHeight + 1);
    }
  }

  /** Soft travelling bloom behind the figure. */
  private drawGlow(nowMs: number): void {
    this.glow.clear();
    const centerX = this.width / 2 + Math.sin(nowMs / 1100) * this.width * 0.16;
    const centerY = this.height * 0.42 + Math.cos(nowMs / 1300) * 40;
    for (let ring = 6; ring >= 1; ring -= 1) {
      this.glow.fillStyle(0xdaff7a, 0.045);
      this.glow.fillCircle(centerX, centerY, ring * 46);
    }
  }

  /** Sparse dark speckles; enough to break up the bands without hurting reading. */
  private drawNoise(nowMs: number): void {
    this.noise.clear();
    const step = Math.floor(nowMs / 90);
    for (let index = 0; index < 46; index += 1) {
      // Deterministic per step, so it flickers as a unit instead of crawling.
      const seed = (index * 2654435761 + step * 40503) >>> 0;
      const x = (seed % this.width) | 0;
      const y = ((seed >>> 9) % this.height) | 0;
      this.noise.fillStyle(0x0b2415, 0.16);
      this.noise.fillRect(x, y, 3, 3);
    }
  }

  destroy(): void {
    this.root.clearMask(true);
    this.mask.destroy();
    this.root.destroy(true);
  }
}
