import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../constants';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';

/**
 * Reusable post-level score screen, shown after a gameplay level finishes
 * and before the next one starts. Every level-specific concern (which scene
 * to retry/continue to, and with what payload) is passed in as data — this
 * scene itself knows nothing about Berlin, Rhythm or Boss.
 *
 * Deliberately not used after BossScene: the final ResultScene/leaderboard
 * flow is untouched.
 */
export interface LevelCompleteSceneData {
  /** Score earned in this level only, not the cumulative total. */
  score: number;
  /** Maximum possible score for this level only. */
  maxScore: number;
  /** Scene to restart for a fresh attempt at this level. */
  retryScene: string;
  /** Data to restart that scene with; carries forward only prior levels' scores. */
  retryData?: Record<string, unknown>;
  /** Scene to advance to once the player accepts this attempt. */
  continueScene: string;
  /** Data to hand to that scene. */
  continueData?: Record<string, unknown>;
}

export class LevelCompleteScene extends Phaser.Scene {
  private levelData!: LevelCompleteSceneData;

  constructor() {
    super('LevelCompleteScene');
  }

  init(data: LevelCompleteSceneData): void {
    this.levelData = data;
  }

  create(): void {
    new OrientationController(this);
    attachFullscreenExitControl(this);
    this.cameras.main.setBackgroundColor('#090611');
    for (let index = 0; index < 8; index += 1) {
      this.add.rectangle(
        60 + index * (DESIGN_WIDTH / 8),
        DESIGN_HEIGHT + 40,
        70,
        220 + (index % 3) * 50,
        0x1a0f28,
      );
    }

    this.add
      .text(DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.3, 'LEVEL COMPLETE', {
        fontFamily: 'Archivo Black',
        fontSize: '56px',
        color: '#ffdf57',
        stroke: '#55145e',
        strokeThickness: 9,
      })
      .setOrigin(0.5);

    this.add
      .text(
        DESIGN_WIDTH / 2,
        DESIGN_HEIGHT * 0.46,
        `SCORE  ${this.levelData.score} / ${this.levelData.maxScore}`,
        {
          fontFamily: 'Space Mono',
          fontSize: '30px',
          fontStyle: 'bold',
          color: '#ffffff',
        },
      )
      .setOrigin(0.5);

    this.createButton(DESIGN_WIDTH / 2 - 160, DESIGN_HEIGHT * 0.68, 'RETRY', '#ff477e', () => {
      this.scene.start(this.levelData.retryScene, this.levelData.retryData);
    });
    this.createButton(DESIGN_WIDTH / 2 + 160, DESIGN_HEIGHT * 0.68, 'CONTINUE', '#ffdf57', () => {
      this.scene.start(this.levelData.continueScene, this.levelData.continueData);
    });
  }

  private createButton(x: number, y: number, label: string, color: string, action: () => void): void {
    const button = this.add
      .text(x, y, label, {
        fontFamily: 'Archivo Black',
        fontSize: '26px',
        color: '#090611',
        backgroundColor: color,
        padding: { x: 28, y: 16 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    button.on('pointerdown', action);
    button.on('pointerover', () => button.setScale(1.04));
    button.on('pointerout', () => button.setScale(1));
  }
}
