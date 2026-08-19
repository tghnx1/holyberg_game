import Phaser from 'phaser';

/**
 * The right-hand portrait panel: an animated green/cyan/yellow-green light
 * gradient with the Magician over it.
 *
 * The portrait is drawn procedurally because no Magician art exists yet. It is
 * isolated here so dropping in a real sprite later means replacing only
 * `buildPortrait()` — the gradient, panel and slide animation are untouched.
 */
export class MagicianPortrait {
  readonly root: Phaser.GameObjects.Container;
  private readonly gradient: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly noise: Phaser.GameObjects.Graphics;
  private readonly portrait: Phaser.GameObjects.Container;
  private readonly mask: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly width: number,
    private readonly height: number,
  ) {
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

    // Keep the moving light strictly inside the panel.
    this.mask = scene.make.graphics({}, false);
    this.mask.fillStyle(0xffffff).fillRect(0, 0, width, height);
    this.root.setMask(this.mask.createGeometryMask());
  }

  /** Replace this method to swap the placeholder for real Magician art. */
  private buildPortrait(): Phaser.GameObjects.Container {
    const centerX = this.width / 2;
    const baseY = this.height * 0.94;
    const robe = this.scene.add
      .triangle(centerX, baseY, 0, 0, -150, -330, 150, -330, 0x140a22, 0.96)
      .setStrokeStyle(4, 0x0a2f1c, 0.9);
    const collar = this.scene.add
      .triangle(centerX, baseY - 300, 0, 0, -96, -70, 96, -70, 0x1d0f2e)
      .setStrokeStyle(3, 0x7cff9b, 0.55);
    const head = this.scene.add
      .ellipse(centerX, baseY - 402, 128, 152, 0x1a1026)
      .setStrokeStyle(4, 0x0a2f1c, 0.9);
    const hatBrim = this.scene.add.ellipse(centerX, baseY - 470, 250, 34, 0x120a1e);
    const hat = this.scene.add
      .triangle(centerX, baseY - 476, 0, 0, -78, -196, 78, -196, 0x120a1e)
      .setStrokeStyle(3, 0x7cff9b, 0.4);
    // Eyes are the only bright feature, so the face reads at a glance.
    const leftEye = this.scene.add.ellipse(centerX - 34, baseY - 408, 26, 14, 0xd8ff5c);
    const rightEye = this.scene.add.ellipse(centerX + 34, baseY - 408, 26, 14, 0xd8ff5c);
    const grin = this.scene.add.graphics();
    grin.lineStyle(4, 0x7cff9b, 0.9);
    grin.beginPath();
    grin.arc(centerX, baseY - 372, 34, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160));
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
   * Redraws the moving light. Called every frame so the gradient never settles.
   */
  update(nowMs: number): void {
    this.drawGradient(nowMs);
    this.drawGlow(nowMs);
    this.drawNoise(nowMs);
    // A slow breath keeps the figure from reading as a static cut-out.
    this.portrait.y = Math.sin(nowMs / 900) * 6;
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
