import Phaser from 'phaser';
import { getAttackBeams, getBeamPolygon, getTelegraphProgress } from './attackRuntime';
import { BOSS_ART } from './bossAssets';
import { BOSS_ARENA } from './bossConfig';
import { BossDepth, BossPalette } from './bossConstants';
import type { ActiveAttack, LaserBeam, LaserPolygon } from './types';

/**
 * Draws telegraphs and live lasers.
 *
 * Every beam is built by `getBeamPolygon` from the boss's own position, so a
 * laser always visibly leaves the boss and fans down to the patch of floor it
 * threatens — nothing is ever drawn falling out of empty air. The floor
 * footprint comes from `getAttackBeams`, the same function the collision test
 * uses, so a telegraph can never lie about where the beam will land.
 */
export class AttackRenderer {
  private readonly telegraphs: Phaser.GameObjects.Graphics;
  private readonly lasers: Phaser.GameObjects.Graphics;
  private readonly laserSprites: Phaser.GameObjects.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.telegraphs = scene.add.graphics().setDepth(BossDepth.TELEGRAPH);
    this.lasers = scene.add.graphics().setDepth(BossDepth.LASER);
  }

  redraw(attacks: readonly ActiveAttack[], nowMs: number, bossX: number): void {
    this.telegraphs.clear();
    this.lasers.clear();
    for (const sprite of this.laserSprites) sprite.setVisible(false);

    let liveLaserCount = 0;

    for (const attack of attacks) {
      const beams = getAttackBeams(attack);
      if (attack.phase === 'telegraph') {
        this.drawTelegraph(attack, beams, bossX, getTelegraphProgress(attack, nowMs));
        continue;
      }
      if (attack.phase !== 'active') continue;
      for (const beam of beams) {
        this.drawLaser(getBeamPolygon(beam, bossX), liveLaserCount, nowMs);
        liveLaserCount += 1;
      }
    }
  }

  /**
   * Windup: a thin sight line from the boss to the target, plus the beam's
   * own outline widening as it charges, so the connection to the boss reads
   * from the first frame.
   */
  private drawTelegraph(
    attack: ActiveAttack,
    beams: readonly LaserBeam[],
    bossX: number,
    progress: number,
  ): void {
    const alpha = 0.16 + progress * 0.5;
    for (const beam of beams) {
      // Grow from a sliver at the muzzle to the full footprint.
      const charging = getBeamPolygon(
        { centerX: beam.centerX, halfWidth: beam.halfWidth * (0.3 + progress * 0.7) },
        bossX,
      );
      this.telegraphs.fillStyle(BossPalette.telegraph, alpha);
      this.telegraphs.fillPoints(this.toPoints(charging), true);

      const outline = getBeamPolygon(beam, bossX);
      this.telegraphs.lineStyle(2, BossPalette.telegraph, 0.35 + progress * 0.5);
      this.telegraphs.strokePoints(this.toPoints(outline), true);

      this.telegraphs.lineStyle(2, BossPalette.telegraph, 0.5 + progress * 0.4);
      this.telegraphs.lineBetween(
        bossX,
        BOSS_ARENA.laserOriginY,
        beam.centerX,
        BOSS_ARENA.floorY,
      );
      // Landing marker on the floor: the exact strip that will damage.
      this.telegraphs.fillStyle(BossPalette.telegraph, 0.28 + progress * 0.45);
      this.telegraphs.fillRect(
        beam.centerX - beam.halfWidth,
        BOSS_ARENA.floorY - 10,
        beam.halfWidth * 2,
        10,
      );
    }
    if (attack.params.type === 'laserWall') this.drawSafeGap(attack);
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

    // Keep the small muzzle flash from the existing renderer. The beam itself
    // is now entirely the authored two-frame animation.
    this.lasers.fillStyle(BossPalette.laserCore, 0.7);
    this.lasers.fillCircle(polygon.originX, polygon.originY, 14);
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

  /** Marks the opening so a wall reads as "go there", not "guess". */
  private drawSafeGap(attack: ActiveAttack): void {
    if (attack.params.type !== 'laserWall') return;
    const { safeGapCenterX, safeGapHalfWidth } = attack.params;
    this.telegraphs.lineStyle(3, BossPalette.safeGap, 0.75);
    this.telegraphs.strokeRect(
      safeGapCenterX - safeGapHalfWidth,
      BOSS_ARENA.floorY - 74,
      safeGapHalfWidth * 2,
      74,
    );
  }

  private toPoints(polygon: LaserPolygon): Phaser.Geom.Point[] {
    const points: Phaser.Geom.Point[] = [];
    for (let index = 0; index < polygon.points.length; index += 2) {
      points.push(new Phaser.Geom.Point(polygon.points[index], polygon.points[index + 1]));
    }
    return points;
  }

  destroy(): void {
    this.telegraphs.destroy();
    this.lasers.destroy();
    for (const sprite of this.laserSprites) sprite.destroy();
    this.laserSprites.length = 0;
  }
}
