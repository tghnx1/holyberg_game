import Phaser from 'phaser';
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

/** Fixed so RETRY and CONTINUE always match, regardless of label length. */
const BUTTON_WIDTH = 220;
const BUTTON_HEIGHT = 62;
const BUTTON_GAP = 22;
const SEGMENT_GAP = 10;

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

    // Viewport-relative, not the fixed design constants: EXPAND scaling
    // keeps height pinned but varies width with the actual aspect ratio, so
    // reading the live camera size is what keeps this centred on any device.
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const centerX = width / 2;

    // One compact block, vertically centred as a unit rather than pinned to
    // fixed screen fractions — the block's own content height decides its
    // position, so title/score/buttons never drift apart on other aspects.
    const titleHeight = 60;
    const scoreHeight = 40;
    const gapTitleToScore = 22;
    const gapScoreToButtons = 46;
    const blockHeight = titleHeight + gapTitleToScore + scoreHeight + gapScoreToButtons + BUTTON_HEIGHT;
    let cursorY = height / 2 - blockHeight / 2;

    const titleY = cursorY + titleHeight / 2;
    this.add
      .text(centerX, titleY, 'LEVEL COMPLETE', {
        fontFamily: 'Archivo Black',
        fontSize: '52px',
        color: '#ffdf57',
        stroke: '#55145e',
        strokeThickness: 9,
      })
      .setOrigin(0.5);
    cursorY += titleHeight + gapTitleToScore;

    const scoreY = cursorY + scoreHeight / 2;
    this.buildScoreLine(centerX, scoreY);
    cursorY += scoreHeight + gapScoreToButtons;

    const buttonsY = cursorY + BUTTON_HEIGHT / 2;
    const groupWidth = BUTTON_WIDTH * 2 + BUTTON_GAP;
    const retryX = centerX - groupWidth / 2 + BUTTON_WIDTH / 2;
    const continueX = centerX + groupWidth / 2 - BUTTON_WIDTH / 2;
    this.createButton(retryX, buttonsY, 'RETRY', '#ff477e', () => {
      this.scene.start(this.levelData.retryScene, this.levelData.retryData);
    });
    this.createButton(continueX, buttonsY, 'CONTINUE', '#ffdf57', () => {
      this.scene.start(this.levelData.continueScene, this.levelData.continueData);
    });
  }

  /**
   * "SCORE  6600 / 8550" as three adjacent segments instead of one string,
   * so the earned score can read visually stronger than the label and the
   * maximum while the whole line still measures and centres as one unit.
   */
  private buildScoreLine(centerX: number, y: number): void {
    const label = this.add
      .text(0, 0, 'SCORE', { fontFamily: 'Space Mono', fontSize: '22px', color: '#a99bc0' })
      .setOrigin(0, 0.5);
    const value = this.add
      .text(0, 0, `${this.levelData.score}`, {
        fontFamily: 'Archivo Black',
        fontSize: '36px',
        color: '#ffdf57',
      })
      .setOrigin(0, 0.5);
    const max = this.add
      .text(0, 0, `/ ${this.levelData.maxScore}`, {
        fontFamily: 'Space Mono',
        fontSize: '22px',
        color: '#9c8fb0',
      })
      .setOrigin(0, 0.5);

    const totalWidth = label.width + SEGMENT_GAP + value.width + SEGMENT_GAP + max.width;
    let cursorX = centerX - totalWidth / 2;
    label.setPosition(cursorX, y);
    cursorX += label.width + SEGMENT_GAP;
    value.setPosition(cursorX, y);
    cursorX += value.width + SEGMENT_GAP;
    max.setPosition(cursorX, y);
  }

  /** Fixed-size button (background rect + centred label), so RETRY and CONTINUE always match. */
  private createButton(x: number, y: number, label: string, color: string, action: () => void): void {
    const background = this.add
      .rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, Phaser.Display.Color.HexStringToColor(color).color)
      .setOrigin(0.5);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'Archivo Black',
        fontSize: '24px',
        color: '#090611',
      })
      .setOrigin(0.5);
    const container = this.add
      .container(x, y, [background, text])
      .setSize(BUTTON_WIDTH, BUTTON_HEIGHT)
      .setInteractive({
        // Children (and so the hit test) are centred on the container's own
        // origin, not its top-left, so the hit rect must be too.
        hitArea: new Phaser.Geom.Rectangle(-BUTTON_WIDTH / 2, -BUTTON_HEIGHT / 2, BUTTON_WIDTH, BUTTON_HEIGHT),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });
    container.on('pointerdown', action);
    container.on('pointerover', () => container.setScale(1.04));
    container.on('pointerout', () => container.setScale(1));
  }
}
