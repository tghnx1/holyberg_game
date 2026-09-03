import Phaser from 'phaser';
import { BossDepth, BossPalette } from './bossConstants';
import type { BossFightSnapshot } from './BossFightDirector';

/**
 * Score, emeralds, combo, phase label and the fight timer.
 *
 * No HP pips: the player cannot be downed here, and a life counter that never
 * reaches zero is worse than none — it promises a failure state the fight does
 * not have.
 */
export class BossHud {
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly emeraldText: Phaser.GameObjects.Text;
  private readonly comboText: Phaser.GameObjects.Text;
  private readonly phaseText: Phaser.GameObjects.Text;
  private readonly timerBar: Phaser.GameObjects.Rectangle;
  private readonly timerTrack: Phaser.GameObjects.Rectangle;
  private readonly flashText: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {
    const width = scene.cameras.main.width;
    const label = { fontFamily: 'Space Mono', fontSize: '18px', color: '#ffffff' } as const;
    this.scoreText = scene.add.text(20, 26, 'SCORE  0', label).setDepth(BossDepth.UI);
    this.emeraldText = scene.add
      .text(20, 50, 'EMERALDS  0', { ...label, color: '#56ffb0' })
      .setDepth(BossDepth.UI);
    this.comboText = scene.add
      .text(20, 74, '', { ...label, color: '#ffdf57' })
      .setDepth(BossDepth.UI);
    this.phaseText = scene.add
      .text(width / 2, 22, 'PHASE 1', {
        fontFamily: 'Archivo Black',
        fontSize: '24px',
        color: '#ffdf57',
      })
      .setOrigin(0.5, 0)
      .setDepth(BossDepth.UI);
    this.timerTrack = scene.add
      .rectangle(width / 2, 60, 420, 10, 0x2a1440)
      .setDepth(BossDepth.UI);
    this.timerBar = scene.add
      .rectangle(width / 2 - 210, 60, 0, 10, BossPalette.safeGap)
      .setOrigin(0, 0.5)
      .setDepth(BossDepth.UI);
    this.flashText = scene.add
      .text(width / 2, 250, '', {
        fontFamily: 'Archivo Black',
        fontSize: '34px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(BossDepth.UI)
      .setAlpha(0);
  }

  update(snapshot: BossFightSnapshot): void {
    this.scoreText.setText(`SCORE  ${snapshot.score.score}`);
    this.emeraldText.setText(`EMERALDS  ${snapshot.score.emeralds}`);
    this.comboText.setText(snapshot.score.combo >= 2 ? `DODGE x${snapshot.score.combo}` : '');
    this.phaseText.setText(snapshot.phase.label);
    const total = Math.max(1, snapshot.elapsedMs + snapshot.remainingMs);
    this.timerBar.width = 420 * Math.min(1, snapshot.elapsedMs / total);
  }

  flash(message: string, color = '#ffffff'): void {
    this.flashText.setText(message).setColor(color).setAlpha(1);
    this.scene.tweens.killTweensOf(this.flashText);
    this.scene.tweens.add({
      targets: this.flashText,
      alpha: 0,
      duration: 700,
      delay: 260,
    });
  }

  /**
   * A small `+100` rising from where the emerald was.
   *
   * At the pickup rather than in the corner: the player's eyes are on their
   * character mid-sprint, and a number in the HUD would be missed entirely.
   */
  popScore(x: number, y: number, amount: number): void {
    const text = this.scene.add
      .text(x, y, `+${amount}`, {
        fontFamily: 'Archivo Black',
        fontSize: '22px',
        color: '#56ffb0',
        stroke: '#0b2d1e',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(BossDepth.UI);
    this.scene.tweens.add({
      targets: text,
      y: y - 52,
      alpha: 0,
      duration: 620,
      onComplete: () => text.destroy(),
    });
  }

  reposition(width: number): void {
    this.phaseText.setX(width / 2);
    this.timerTrack.setX(width / 2);
    this.timerBar.setX(width / 2 - 210);
    this.flashText.setX(width / 2);
  }
}
