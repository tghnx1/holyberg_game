import Phaser from 'phaser';
import { BOSS_PLAYER } from './bossConfig';
import { BossDepth, BossPalette } from './bossConstants';
import type { BossFightSnapshot } from './BossFightDirector';

/** HP pips, score, combo, phase label, fight timer and the dash cooldown pip. */
export class BossHud {
  private readonly hearts: Phaser.GameObjects.Arc[] = [];
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly comboText: Phaser.GameObjects.Text;
  private readonly phaseText: Phaser.GameObjects.Text;
  private readonly timerBar: Phaser.GameObjects.Rectangle;
  private readonly timerTrack: Phaser.GameObjects.Rectangle;
  private readonly dashPip: Phaser.GameObjects.Rectangle;
  private readonly dashLabel: Phaser.GameObjects.Text;
  private readonly flashText: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {
    const width = scene.cameras.main.width;
    for (let index = 0; index < BOSS_PLAYER.hitPoints; index += 1) {
      this.hearts.push(
        scene.add
          .circle(30 + index * 34, 34, 13, BossPalette.laser)
          .setStrokeStyle(3, 0xffffff, 0.85)
          .setDepth(BossDepth.UI),
      );
    }
    const label = { fontFamily: 'Space Mono', fontSize: '18px', color: '#ffffff' } as const;
    this.scoreText = scene.add.text(20, 60, 'SCORE  0', label).setDepth(BossDepth.UI);
    this.comboText = scene.add
      .text(20, 84, '', { ...label, color: '#ffdf57' })
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
    this.dashLabel = scene.add
      .text(width - 20, 34, 'DASH', { ...label, fontSize: '14px' })
      .setOrigin(1, 0.5)
      .setDepth(BossDepth.UI);
    this.dashPip = scene.add
      .rectangle(width - 20, 56, 96, 8, BossPalette.safeGap)
      .setOrigin(1, 0.5)
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

  update(snapshot: BossFightSnapshot, dashProgress: number): void {
    this.hearts.forEach((heart, index) => {
      const alive = index < snapshot.hitPoints;
      heart.setFillStyle(alive ? BossPalette.laser : 0x2a1440);
      heart.setAlpha(alive ? 1 : 0.5);
    });
    this.scoreText.setText(`SCORE  ${snapshot.score.score}`);
    this.comboText.setText(snapshot.score.combo >= 2 ? `DODGE x${snapshot.score.combo}` : '');
    this.phaseText.setText(snapshot.phase.label);
    const total = Math.max(1, snapshot.elapsedMs + snapshot.remainingMs);
    this.timerBar.width = 420 * Math.min(1, snapshot.elapsedMs / total);
    this.dashPip.width = 96 * dashProgress;
    this.dashPip.setFillStyle(dashProgress >= 1 ? BossPalette.safeGap : 0x5a3a70);
    this.dashLabel.setAlpha(dashProgress >= 1 ? 1 : 0.55);
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

  reposition(width: number): void {
    this.phaseText.setX(width / 2);
    this.timerTrack.setX(width / 2);
    this.timerBar.setX(width / 2 - 210);
    this.dashLabel.setX(width - 20);
    this.dashPip.setX(width - 20);
    this.flashText.setX(width / 2);
  }
}
