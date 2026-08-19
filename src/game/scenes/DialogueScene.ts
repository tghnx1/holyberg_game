import Phaser from 'phaser';
import { DialogueDepth, DialogueLayout, DialoguePalette } from '../dialogue/dialogueConstants';
import { DialoguePanels } from '../dialogue/DialoguePanels';
import { getDialogueScript, METRO_MAGICIAN_DIALOGUE } from '../dialogue/dialogueScripts';
import {
  DIALOGUE_TIMING,
  getHoldDurationMs,
  getRevealedCharacterCount,
  getRevealedText,
  getTypedCharacterCount,
} from '../dialogue/dialogueTiming';
import { MagicianPortrait } from '../dialogue/MagicianPortrait';
import { StationSceneView } from '../dialogue/StationSceneView';
import type { DialogueScript } from '../dialogue/types';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';

export interface DialogueSceneData {
  /** Id from dialogueScripts; defaults to the metro/Magician dialogue. */
  scriptId?: string;
  /** Forwarded untouched to the next scene, so level payloads survive. */
  payload?: Record<string, unknown>;
}

type DialoguePhase = 'slidingIn' | 'typing' | 'holding' | 'glitching' | 'slidingOut' | 'done';

/**
 * Inter-level dialogue, in the Hotline Miami presentation style: black bars top
 * and bottom, the scene on the left, a big talking portrait on the right, all
 * four sliding into place at once.
 *
 * Content lives in `dialogue/dialogueScripts.ts` and pacing in
 * `dialogue/dialogueTiming.ts`, so adding another dialogue needs no changes
 * here beyond passing a different `scriptId`.
 */
export class DialogueScene extends Phaser.Scene {
  private script!: DialogueScript;
  private payload: Record<string, unknown> = {};
  private panels!: DialoguePanels;
  private stationScene?: StationSceneView;
  private portrait?: MagicianPortrait;
  private speakerText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private glitchOverlay!: Phaser.GameObjects.Rectangle;
  private skipHint!: Phaser.GameObjects.Text;
  private skipFill!: Phaser.GameObjects.Rectangle;
  private lineIndex = 0;
  private phase: DialoguePhase = 'slidingIn';
  private phaseStartedAt = 0;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private spaceHeldSince?: number;
  private finished = false;

  constructor() {
    super('DialogueScene');
  }

  init(data: DialogueSceneData): void {
    this.script = getDialogueScript(data.scriptId ?? '') ?? METRO_MAGICIAN_DIALOGUE;
    this.payload = data.payload ?? {};
    this.lineIndex = 0;
    this.phase = 'slidingIn';
    this.spaceHeldSince = undefined;
    this.finished = false;
  }

  create(): void {
    new OrientationController(this);
    attachFullscreenExitControl(this);
    this.cameras.main.setBackgroundColor('#000000');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    const { width, height } = this.cameras.main;
    const bodyTop = DialogueLayout.topBarHeight;
    const bodyHeight = height - DialogueLayout.topBarHeight - DialogueLayout.bottomBarHeight;
    const sceneWidth = Math.round(width * DialogueLayout.scenePanelWidthRatio);
    const portraitWidth = width - sceneWidth;

    this.panels = new DialoguePanels(this);
    this.buildScenePanel(sceneWidth, bodyHeight, bodyTop);
    this.buildPortraitPanel(portraitWidth, bodyHeight, sceneWidth, bodyTop);
    this.buildTopBar(width);
    this.buildBottomBar(width, height);

    this.glitchOverlay = this.add
      .rectangle(0, 0, width, height, DialoguePalette.glitch)
      .setOrigin(0, 0)
      .setDepth(DialogueDepth.GLITCH)
      .setAlpha(0);

    this.buildSkipHint(width, height);
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.panels.slideIn(() => {
      this.stationScene?.playArrival();
      this.startLine(0);
    });
  }

  private buildScenePanel(width: number, height: number, top: number): void {
    this.stationScene = new StationSceneView(this, width, height);
    this.stationScene.root.setDepth(DialogueDepth.SCENE);
    this.panels.add({
      target: this.stationScene.root,
      restX: 0,
      restY: top,
      // Enters from the left, entirely off-screen.
      offX: -width,
      offY: top,
    });
  }

  private buildPortraitPanel(width: number, height: number, left: number, top: number): void {
    this.portrait = new MagicianPortrait(this, width, height);
    this.portrait.root.setDepth(DialogueDepth.PORTRAIT);
    this.panels.add({
      target: this.portrait.root,
      restX: left,
      restY: top,
      // Enters from the right.
      offX: this.cameras.main.width,
      offY: top,
    });
  }

  private buildTopBar(width: number): void {
    const bar = this.add
      .rectangle(0, 0, width, DialogueLayout.topBarHeight, DialoguePalette.bar)
      .setOrigin(0, 0);
    const title = this.add
      .text(DialogueLayout.textPaddingX, DialogueLayout.topBarHeight / 2, 'BERLIN — UNDERGROUND', {
        fontFamily: 'Archivo Black',
        fontSize: '30px',
        color: '#ffdf57',
      })
      .setOrigin(0, 0.5);
    const container = this.add
      .container(0, 0, [bar, title])
      .setDepth(DialogueDepth.BARS);
    this.panels.add({
      target: container,
      restX: 0,
      restY: 0,
      offX: 0,
      // Enters from the top.
      offY: -DialogueLayout.topBarHeight,
    });
  }

  private buildBottomBar(width: number, height: number): void {
    const top = height - DialogueLayout.bottomBarHeight;
    const bar = this.add
      .rectangle(0, 0, width, DialogueLayout.bottomBarHeight, DialoguePalette.bar)
      .setOrigin(0, 0);
    this.speakerText = this.add
      .text(DialogueLayout.textPaddingX, DialogueLayout.speakerOffsetY, this.script.speaker, {
        fontFamily: 'Archivo Black',
        fontSize: '22px',
        color: DialoguePalette.speaker,
      })
      .setOrigin(0, 0);
    this.bodyText = this.add
      .text(DialogueLayout.textPaddingX, DialogueLayout.textOffsetY, '', {
        fontFamily: 'Archivo Black',
        fontSize: '34px',
        color: DialoguePalette.text,
        lineSpacing: 6,
      })
      .setOrigin(0, 0);
    const container = this.add
      .container(0, top, [bar, this.speakerText, this.bodyText])
      .setDepth(DialogueDepth.BARS);
    this.panels.add({
      target: container,
      restX: 0,
      restY: top,
      offX: 0,
      // Enters from the bottom.
      offY: height,
    });
  }

  private buildSkipHint(width: number, height: number): void {
    this.skipHint = this.add
      .text(width - DialogueLayout.textPaddingX, height - 26, 'HOLD SPACE TO SKIP', {
        fontFamily: 'Space Mono',
        fontSize: '15px',
        color: DialoguePalette.skipHint,
      })
      .setOrigin(1, 1)
      .setDepth(DialogueDepth.SKIP);
    // Fills left-to-right while SPACE is held, so the skip is never a surprise.
    this.skipFill = this.add
      .rectangle(width - DialogueLayout.textPaddingX, height - 20, 0, 3, 0xffdf57)
      .setOrigin(1, 0)
      .setDepth(DialogueDepth.SKIP);
  }

  private startLine(index: number): void {
    this.lineIndex = index;
    this.bodyText.setText('');
    this.setPhase('typing');
  }

  private setPhase(phase: DialoguePhase): void {
    this.phase = phase;
    this.phaseStartedAt = this.time.now;
  }

  private get currentLine() {
    return this.script.lines[this.lineIndex];
  }

  update(): void {
    const now = this.time.now;
    this.stationScene?.update(now);
    this.portrait?.update(now);
    this.updateSkip(now);
    if (this.finished) return;

    const elapsed = now - this.phaseStartedAt;
    switch (this.phase) {
      case 'typing':
        this.updateTyping(elapsed);
        break;
      case 'holding':
        if (elapsed >= this.currentHoldMs()) this.advance();
        break;
      case 'glitching':
        if (elapsed >= DIALOGUE_TIMING.glitchMs) this.startLine(this.lineIndex + 1);
        break;
      default:
        break;
    }
  }

  private updateTyping(elapsed: number): void {
    const { text } = this.currentLine;
    const revealed = getRevealedCharacterCount(text, elapsed);
    this.bodyText.setText(getRevealedText(text, revealed));
    if (revealed >= getTypedCharacterCount(text)) this.setPhase('holding');
  }

  private currentHoldMs(): number {
    const line = this.currentLine;
    const base = getHoldDurationMs(line.text, line.holdMsOverride);
    // The last line gets an extra beat before the panels leave.
    return this.lineIndex === this.script.lines.length - 1
      ? base + DIALOGUE_TIMING.finalHoldMs
      : base;
  }

  private advance(): void {
    if (this.lineIndex >= this.script.lines.length - 1) {
      this.exit();
      return;
    }
    this.playGlitch();
    this.setPhase('glitching');
  }

  /** Short white flash plus a text jolt; covers the swap between lines. */
  private playGlitch(): void {
    this.glitchOverlay.setAlpha(0.5);
    this.tweens.add({
      targets: this.glitchOverlay,
      alpha: 0,
      duration: DIALOGUE_TIMING.glitchMs,
    });
    this.bodyText.setX(DialogueLayout.textPaddingX + 10);
    this.tweens.add({
      targets: this.bodyText,
      x: DialogueLayout.textPaddingX,
      duration: DIALOGUE_TIMING.glitchMs,
    });
  }

  private updateSkip(now: number): void {
    if (this.finished) return;
    const held = this.spaceKey?.isDown === true;
    if (!held) {
      this.spaceHeldSince = undefined;
      this.skipFill.width = 0;
      return;
    }
    this.spaceHeldSince ??= now;
    const progress = Math.min(1, (now - this.spaceHeldSince) / DIALOGUE_TIMING.skipHoldMs);
    this.skipFill.width = this.skipHint.width * progress;
    if (progress >= 1) this.exit();
  }

  /** Slides everything back out the way it came in, then starts the next scene. */
  private exit(): void {
    if (this.finished) return;
    this.finished = true;
    this.setPhase('slidingOut');
    this.skipHint.setVisible(false);
    this.skipFill.setVisible(false);
    this.panels.slideOut(() => {
      this.scene.start(this.script.nextScene, this.payload);
    });
  }

  private cleanup(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.stationScene?.destroy();
    this.portrait?.destroy();
    this.stationScene = undefined;
    this.portrait = undefined;
  }
}
