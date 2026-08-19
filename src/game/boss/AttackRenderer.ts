import Phaser from 'phaser';
import { getAttackBeams, getBeamPolygon, getTelegraphProgress } from './attackRuntime';
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

  constructor(scene: Phaser.Scene) {
    this.telegraphs = scene.add.graphics().setDepth(BossDepth.TELEGRAPH);
    this.lasers = scene.add.graphics().setDepth(BossDepth.LASER);
  }

  redraw(attacks: readonly ActiveAttack[], nowMs: number, bossX: number): void {
    this.telegraphs.clear();
    this.lasers.clear();

    for (const attack of attacks) {
      const beams = getAttackBeams(attack);
      if (attack.phase === 'telegraph') {
        this.drawTelegraph(attack, beams, bossX, getTelegraphProgress(attack, nowMs));
        continue;
      }
      if (attack.phase !== 'active') continue;
      for (const beam of beams) this.drawLaser(getBeamPolygon(beam, bossX));
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

  private drawLaser(polygon: LaserPolygon): void {
    const points = this.toPoints(polygon);
    this.lasers.fillStyle(BossPalette.laser, 0.82);
    this.lasers.fillPoints(points, true);
    // Bright core along the same axis, so the beam reads as a single shot.
    const core = getBeamPolygon(
      { centerX: polygon.footprintCenterX, halfWidth: this.coreHalfWidth(polygon) },
      polygon.originX,
      polygon.originY,
      BOSS_ARENA.floorY,
      BOSS_ARENA.laserOriginHalfWidth * 0.4,
    );
    this.lasers.fillStyle(BossPalette.laserCore, 0.9);
    this.lasers.fillPoints(this.toPoints(core), true);
    // Muzzle flare anchors the shot to the boss.
    this.lasers.fillStyle(BossPalette.laserCore, 0.7);
    this.lasers.fillCircle(polygon.originX, polygon.originY, 14);
  }

  /** Half-width of the bright core at the floor end of a beam. */
  private coreHalfWidth(polygon: LaserPolygon): number {
    const footprintHalfWidth = Math.abs(polygon.points[4] - polygon.footprintCenterX);
    return footprintHalfWidth * 0.32;
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
  }
}
