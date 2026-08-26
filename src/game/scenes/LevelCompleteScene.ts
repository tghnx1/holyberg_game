import Phaser from 'phaser';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import type { ViewportInfo } from '../responsive/ViewportInfo';

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
/**
 * Slop added around each button's visible rect for the hit test only. A
 * fingertip lands far less precisely than a cursor, and the visible 62px-tall
 * button is close to the ~44px minimum touch target once the canvas is scaled
 * down on a phone — this keeps a near-miss on the edge still counting.
 */
const TOUCH_PADDING = 18;

/** Vertical rhythm of the centred title/score/buttons block. */
const TITLE_HEIGHT = 60;
const SCORE_HEIGHT = 40;
const GAP_TITLE_TO_SCORE = 22;
const GAP_SCORE_TO_BUTTONS = 46;

interface LevelCompleteButton {
  background: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
}

export class LevelCompleteScene extends Phaser.Scene {
  /** Transition/results screen, not gameplay. */
  static readonly pausable = false;

  private levelData!: LevelCompleteSceneData;
  private titleText!: Phaser.GameObjects.Text;
  private scoreLabel!: Phaser.GameObjects.Text;
  private scoreValue!: Phaser.GameObjects.Text;
  private scoreMax!: Phaser.GameObjects.Text;
  private retryButton!: LevelCompleteButton;
  private continueButton!: LevelCompleteButton;
  /**
   * Latched by the first accepted tap. Both buttons start a scene, and a
   * second `scene.start` on the way out (a double-tap, or RETRY and CONTINUE
   * caught by two fingers) would tear down and restart mid-transition.
   */
  private activated = false;

  constructor() {
    super('LevelCompleteScene');
  }

  init(data: LevelCompleteSceneData): void {
    this.levelData = data;
    // init() runs again on every re-entry to this scene, create() included, so
    // the guard has to be cleared here rather than at field-initialisation.
    this.activated = false;
  }

  create(): void {
    attachFullscreenExitControl(this);
    this.cameras.main.setBackgroundColor('#090611');

    this.buildUi();
    // Built before the controller, because OrientationController runs its
    // onLayout once from its own constructor — there has to be something to
    // lay out by then.
    new OrientationController(this, { onLayout: (viewport) => this.layoutUi(viewport) });
    this.layoutUi();
  }

  private buildUi(): void {
    this.titleText = this.add
      .text(0, 0, 'LEVEL COMPLETE', {
        fontFamily: 'Archivo Black',
        fontSize: '52px',
        color: '#ffdf57',
        stroke: '#55145e',
        strokeThickness: 9,
      })
      .setOrigin(0.5);

    // "SCORE  6600 / 8550" as three adjacent segments instead of one string,
    // so the earned score can read visually stronger than the label and the
    // maximum while the whole line still measures and centres as one unit.
    this.scoreLabel = this.add
      .text(0, 0, 'SCORE', { fontFamily: 'Space Mono', fontSize: '22px', color: '#a99bc0' })
      .setOrigin(0, 0.5);
    this.scoreValue = this.add
      .text(0, 0, `${this.levelData.score}`, {
        fontFamily: 'Archivo Black',
        fontSize: '36px',
        color: '#ffdf57',
      })
      .setOrigin(0, 0.5);
    this.scoreMax = this.add
      .text(0, 0, `/ ${this.levelData.maxScore}`, {
        fontFamily: 'Space Mono',
        fontSize: '22px',
        color: '#9c8fb0',
      })
      .setOrigin(0, 0.5);

    this.retryButton = this.createButton('RETRY', '#ff477e', () => {
      this.scene.start(this.levelData.retryScene, this.levelData.retryData);
    });
    this.continueButton = this.createButton('CONTINUE', '#ffdf57', () => {
      this.scene.start(this.levelData.continueScene, this.levelData.continueData);
    });
  }

  /**
   * Positions the whole composition from the *live* camera size, so it
   * re-centres after a mobile fullscreen toggle, an orientation change or any
   * other resize. Each button's hit area is local to its own background rect,
   * so moving the rect moves the hit area with it — nothing to re-register.
   */
  private layoutUi(viewport?: ViewportInfo): void {
    // Viewport-relative, not the fixed design constants: EXPAND scaling
    // keeps height pinned but varies width with the actual aspect ratio, so
    // reading the live camera size is what keeps this centred on any device.
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const centerX = width / 2;

    // One compact block, vertically centred as a unit rather than pinned to
    // fixed screen fractions — the block's own content height decides its
    // position, so title/score/buttons never drift apart on other aspects.
    const blockHeight =
      TITLE_HEIGHT + GAP_TITLE_TO_SCORE + SCORE_HEIGHT + GAP_SCORE_TO_BUTTONS + BUTTON_HEIGHT;
    let cursorY = height / 2 - blockHeight / 2;

    this.titleText.setPosition(centerX, cursorY + TITLE_HEIGHT / 2);
    cursorY += TITLE_HEIGHT + GAP_TITLE_TO_SCORE;

    this.layoutScoreLine(centerX, cursorY + SCORE_HEIGHT / 2);
    cursorY += SCORE_HEIGHT + GAP_SCORE_TO_BUTTONS;

    // The safe area, not just the camera box: on a notched phone in landscape
    // the outer strip is physically unreachable, so a button sitting in it
    // looks tappable and is not.
    const margin = viewport?.safeMargin ?? 0;
    // Close the gap before anything else if the pair will not fit; the
    // buttons themselves keep their authored size.
    const gap = Phaser.Math.Clamp(width - margin * 2 - BUTTON_WIDTH * 2, 0, BUTTON_GAP);
    const groupWidth = BUTTON_WIDTH * 2 + gap;
    // Clamp rather than centre blindly, so neither button can end up outside
    // the reachable area on a narrow or heavily inset viewport.
    const maxLeft = Math.max(margin, width - margin - groupWidth);
    const groupLeft = Phaser.Math.Clamp(centerX - groupWidth / 2, margin, maxLeft);

    const buttonsY = Phaser.Math.Clamp(
      cursorY + BUTTON_HEIGHT / 2,
      margin + BUTTON_HEIGHT / 2,
      Math.max(margin + BUTTON_HEIGHT / 2, height - margin - BUTTON_HEIGHT / 2),
    );

    this.positionButton(this.retryButton, groupLeft + BUTTON_WIDTH / 2, buttonsY);
    this.positionButton(
      this.continueButton,
      groupLeft + BUTTON_WIDTH + gap + BUTTON_WIDTH / 2,
      buttonsY,
    );
  }

  private layoutScoreLine(centerX: number, y: number): void {
    const totalWidth =
      this.scoreLabel.width + SEGMENT_GAP + this.scoreValue.width + SEGMENT_GAP + this.scoreMax.width;
    let cursorX = centerX - totalWidth / 2;
    this.scoreLabel.setPosition(cursorX, y);
    cursorX += this.scoreLabel.width + SEGMENT_GAP;
    this.scoreValue.setPosition(cursorX, y);
    cursorX += this.scoreValue.width + SEGMENT_GAP;
    this.scoreMax.setPosition(cursorX, y);
  }

  private positionButton(button: LevelCompleteButton, x: number, y: number): void {
    button.background.setPosition(x, y);
    button.text.setPosition(x, y);
  }

  /**
   * Fixed-size button (background rect + centred label), so RETRY and
   * CONTINUE always match.
   *
   * The visible background rect is the interactive object, rather than a
   * wrapping container with a hand-written hit area — its hit test is the
   * rect's own geometry (padded for fingers), so it can never drift out of
   * alignment with what is drawn. The label sits on top but is left
   * non-interactive, so taps over the text fall through to the rect and the
   * whole visible button is tappable.
   */
  private createButton(label: string, color: string, action: () => void): LevelCompleteButton {
    const background = this.add
      .rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, Phaser.Display.Color.HexStringToColor(color).color)
      .setOrigin(0.5)
      .setInteractive({
        // Local hit-area coordinates are origin-adjusted, so (0,0) is the
        // rect's top-left; the padding grows it evenly on all four sides.
        hitArea: new Phaser.Geom.Rectangle(
          -TOUCH_PADDING,
          -TOUCH_PADDING,
          BUTTON_WIDTH + TOUCH_PADDING * 2,
          BUTTON_HEIGHT + TOUCH_PADDING * 2,
        ),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'Archivo Black',
        fontSize: '24px',
        color: '#090611',
      })
      .setOrigin(0.5);
    const button: LevelCompleteButton = { background, text };

    // Activate on release, not on press. A touch that starts a scene on
    // pointerdown leaves its pointerup to land on whatever the next scene put
    // under that finger — which is how a single tap here could also fire the
    // incoming level's touch controls.
    let pressed = false;
    background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pressed = true;
      this.swallow(pointer);
    });
    background.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const wasPressed = pressed;
      pressed = false;
      this.swallow(pointer);
      if (!wasPressed) return;
      this.activate(action);
    });

    // Hover feedback is a mouse affordance. A touch has no hover state — it
    // would fire `pointerover` on contact and resize the button under the
    // finger mid-tap — so touch pointers are ignored here entirely.
    background.on('pointerover', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) return;
      this.setButtonScale(button, 1.04);
    });
    background.on('pointerout', (pointer: Phaser.Input.Pointer) => {
      // Disarm only on a genuine drag-off — a finger still held down that has
      // moved away. Lifting a touch also emits `pointerout`, and Phaser may
      // emit it before the matching `pointerup`; clearing unconditionally
      // here would swallow the very tap this button exists to receive.
      if (pointer.isDown) pressed = false;
      if (pointer.wasTouch) return;
      this.setButtonScale(button, 1);
    });

    return button;
  }

  private setButtonScale(button: LevelCompleteButton, scale: number): void {
    button.background.setScale(scale);
    button.text.setScale(scale);
  }

  /**
   * Keeps this tap from being seen by anything else this frame, and — via the
   * DOM event — from reaching the next scene's touch controls.
   */
  private swallow(pointer: Phaser.Input.Pointer): void {
    this.input.stopPropagation();
    pointer.event?.stopPropagation();
  }

  /** Runs the first accepted press only, and stops both buttons responding after it. */
  private activate(action: () => void): void {
    if (this.activated) return;
    this.activated = true;
    this.retryButton.background.disableInteractive();
    this.continueButton.background.disableInteractive();
    action();
  }
}
