import Phaser from 'phaser';
import { getAttackBeams, getBeamPolygon, getTelegraphProgress } from './attackRuntime';
import { BOSS_ART } from './bossAssets';
import { BOSS_ARENA } from './bossConfig';
import { BossDepth, BossPalette } from './bossConstants';
import type { ActiveAttack, LaserBeam, LaserPolygon } from './types';

/**
 * Draws telegraphs and live lasers.
 *
 * Every active beam is built by `getBeamPolygon` from the boss's own
 * position, so the authored laser artwork always leaves the boss and reaches
 * the collision footprint. Telegraphs intentionally draw only a thin aim ray;
 * no generated shape competes with the authored attack art.
 */
export class AttackRenderer {
  private readonly telegraphs: Phaser.GameObjects.Graphics;
  private readonly laserSprites: Phaser.GameObjects.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.telegraphs = scene.add.graphics().setDepth(BossDepth.TELEGRAPH);
  }

  redraw(
    attacks: readonly ActiveAttack[],
    nowMs: number,
    sphereCenter: { x: number; y: number },
  ): void {
    this.telegraphs.clear();
    for (const sprite of this.laserSprites) sprite.setVisible(false);

    let liveLaserCount = 0;

    for (const attack of attacks) {
      const beams = getAttackBeams(attack);
      if (attack.phase === 'telegraph') {
        this.drawTelegraph(beams, sphereCenter, getTelegraphProgress(attack, nowMs));
        continue;
      }
      if (attack.phase !== 'active') continue;
      for (const beam of beams) {
        this.drawLaser(
          getBeamPolygon(beam, sphereCenter),
          liveLaserCount,
          nowMs,
        );
        liveLaserCount += 1;
      }
    }
  }

  /**
   * Windup: only the thin aim ray. Collision still uses the full beam
   * geometry; this renderer deliberately adds no cone, landing marker or
   * safe-gap primitive around it.
   */
  private drawTelegraph(
    beams: readonly LaserBeam[],
    sphereCenter: { x: number; y: number },
    progress: number,
  ): void {
    for (const beam of beams) {
      this.telegraphs.lineStyle(2, BossPalette.telegraph, 0.45 + progress * 0.45);
      this.telegraphs.lineBetween(
        sphereCenter.x,
        sphereCenter.y,
        beam.centerX,
        BOSS_ARENA.floorY,
      );
    }
  }

  private drawLaser(polygon: LaserPolygon, index: number, nowMs: number): void {
    const sprite = this.getLaserSprite(index);
    const deltaX = polygon.footprintCenterX - polygon.originX;
    const deltaY = BOSS_ARENA.floorY - polygon.originY;
    const length = Math.hypot(deltaX, deltaY);
    const footprintWidth = Math.abs(polygon.points[4] - polygon.points[6]);
    const frame = BOSS_ART.laser[Math.floor(nowMs / 90) % BOSS_ART.laser.length];
    sprite
      .setTexture(frame.key)
      .setPosition(polygon.originX, polygon.originY)
      // Source artwork points down. Rotate that axis toward the live footprint.
      .setRotation(Math.atan2(deltaY, deltaX) - Math.PI / 2)
      // Transparent side padding occupies roughly half the source canvas.
      .setDisplaySize(Math.max(74, footprintWidth * 1.8), length)
      .setVisible(true);
  }

  private getLaserSprite(index: number): Phaser.GameObjects.Image {
    const existing = this.laserSprites[index];
    if (existing) return existing;
    const sprite = this.scene.add
      .image(0, 0, BOSS_ART.laser[0].key)
      .setOrigin(0.5, 0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(BossDepth.LASER)
      .setVisible(false);
    this.laserSprites.push(sprite);
    return sprite;
  }

  destroy(): void {
    this.telegraphs.destroy();
    for (const sprite of this.laserSprites) sprite.destroy();
    this.laserSprites.length = 0;
  }
}
