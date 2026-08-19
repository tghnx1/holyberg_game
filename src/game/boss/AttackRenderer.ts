import Phaser from 'phaser';
import { getAttackBeams, getTelegraphProgress } from './attackRuntime';
import { BOSS_ARENA } from './bossConfig';
import { BossDepth, BossPalette } from './bossConstants';
import type { ActiveAttack, ArenaBounds } from './types';

/**
 * Draws telegraphs and live lasers.
 *
 * Every shape comes from `getAttackBeams`, the same function the collision test
 * uses, so what is drawn is exactly what can damage the player — a telegraph
 * can never lie about where the beam will land.
 */
export class AttackRenderer {
  private readonly telegraphs: Phaser.GameObjects.Graphics;
  private readonly lasers: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.telegraphs = scene.add.graphics().setDepth(BossDepth.TELEGRAPH);
    this.lasers = scene.add.graphics().setDepth(BossDepth.LASER);
  }

  redraw(attacks: readonly ActiveAttack[], nowMs: number, bounds: ArenaBounds): void {
    this.telegraphs.clear();
    this.lasers.clear();
    const top = BOSS_ARENA.laserTopY;
    const height = BOSS_ARENA.floorY - top;

    for (const attack of attacks) {
      const beams = getAttackBeams(attack, nowMs, bounds);
      if (attack.phase === 'telegraph') {
        const progress = getTelegraphProgress(attack, nowMs);
        // Widening band + rising alpha: the closer to firing, the louder it is.
        const alpha = 0.16 + progress * 0.5;
        for (const beam of beams) {
          const width = beam.halfWidth * 2 * (0.35 + progress * 0.65);
          this.telegraphs.fillStyle(BossPalette.telegraph, alpha);
          this.telegraphs.fillRect(beam.centerX - width / 2, top, width, height);
          this.telegraphs.lineStyle(2, BossPalette.telegraph, 0.35 + progress * 0.5);
          this.telegraphs.strokeRect(beam.centerX - beam.halfWidth, top, beam.halfWidth * 2, height);
        }
        if (attack.params.type === 'laserWall') this.drawSafeGap(attack, top, height);
        continue;
      }

      if (attack.phase !== 'active') continue;
      for (const beam of beams) {
        this.lasers.fillStyle(BossPalette.laser, 0.82);
        this.lasers.fillRect(beam.centerX - beam.halfWidth, top, beam.halfWidth * 2, height);
        this.lasers.fillStyle(BossPalette.laserCore, 0.9);
        this.lasers.fillRect(beam.centerX - beam.halfWidth * 0.32, top, beam.halfWidth * 0.64, height);
      }
    }
  }

  /** Marks the opening so a wall reads as "go there", not "guess". */
  private drawSafeGap(attack: ActiveAttack, top: number, height: number): void {
    if (attack.params.type !== 'laserWall') return;
    const { safeGapCenterX, safeGapHalfWidth } = attack.params;
    this.telegraphs.lineStyle(3, BossPalette.safeGap, 0.75);
    this.telegraphs.strokeRect(
      safeGapCenterX - safeGapHalfWidth,
      top,
      safeGapHalfWidth * 2,
      height,
    );
  }

  destroy(): void {
    this.telegraphs.destroy();
    this.lasers.destroy();
  }
}
