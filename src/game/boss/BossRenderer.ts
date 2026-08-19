import Phaser from 'phaser';
import { BOSS_ARENA } from './bossConfig';
import { BossDepth } from './bossConstants';

/**
 * The boss's visual, and nothing else.
 *
 * Gameplay never reads from this class — attacks come from the fight plan and
 * damage from the collision geometry — so replacing the placeholder with a real
 * sprite means changing only `build()` and `update()` here.
 */
export class BossRenderer {
  private readonly root: Phaser.GameObjects.Container;
  private readonly core: Phaser.GameObjects.Arc;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly eye: Phaser.GameObjects.Arc;
  private readonly wings: Phaser.GameObjects.Triangle[];

  constructor(
    private readonly scene: Phaser.Scene,
    centerX: number,
  ) {
    this.core = scene.add.circle(0, 0, 58, 0x2a1140).setStrokeStyle(5, 0xff477e, 0.95);
    this.ring = scene.add.circle(0, 0, 78).setStrokeStyle(3, 0x56ffff, 0.45);
    this.eye = scene.add.circle(0, 4, 20, 0xffdf57);
    this.wings = [
      scene.add.triangle(-96, 6, 0, 0, 74, -26, 74, 30, 0x3a1750).setStrokeStyle(3, 0xff477e, 0.8),
      scene.add.triangle(96, 6, 0, 0, -74, -26, -74, 30, 0x3a1750).setStrokeStyle(3, 0xff477e, 0.8),
    ];
    this.root = scene.add
      .container(centerX, BOSS_ARENA.bossCenterY, [...this.wings, this.ring, this.core, this.eye])
      .setDepth(BossDepth.BOSS);
  }

  /** Idle hover plus a pupil that tracks the player, so aim reads as intent. */
  update(nowMs: number, centerX: number, playerX: number): void {
    this.root.x = centerX;
    this.root.y = BOSS_ARENA.bossCenterY + Math.sin(nowMs / 520) * 9;
    this.ring.setScale(1 + Math.sin(nowMs / 340) * 0.04);
    const offset = Phaser.Math.Clamp((playerX - centerX) / 14, -22, 22);
    this.eye.x = offset;
  }

  /** Flash when an attack goes live, purely cosmetic. */
  pulse(color = 0xff477e): void {
    this.core.setStrokeStyle(5, color, 1);
    this.scene.tweens.add({
      targets: this.root,
      scale: { from: 1.06, to: 1 },
      duration: 220,
      ease: 'Quad.easeOut',
    });
  }

  setPhaseTint(color: number): void {
    this.core.setFillStyle(color);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
