import Phaser from 'phaser';
import { DialogueDepth, DialogueLayout, DialoguePalette } from '../dialogue/dialogueConstants';
import { DialoguePanels } from '../dialogue/DialoguePanels';
import {
  buildDiagonalStripPoints,
  computeDialogueLayout,
  type DialogueLayoutMetrics,
} from '../dialogue/dialogueLayoutMetrics';
import { getDialogueScript, METRO_MAGICIAN_DIALOGUE } from '../dialogue/dialogueScripts';
import {
  DIALOGUE_TIMING,
  getHoldDurationMs,
  getRevealedCharacterCount,
  getRevealedText,
  getTypedCharacterCount,
} from '../dialogue/dialogueTiming';
import { MagicianPortrait } from '../dialogue/MagicianPortrait';
import { getSpeakerPortrait } from '../dialogue/speakerPortraits';
import { StationSceneView } from '../dialogue/StationSceneView';
import { TalkingPortrait } from '../dialogue/TalkingPortrait';
import type { DialogueScript } from '../dialogue/types';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import type { SceneEditor } from '../systems/SceneEditor';
import { OrientationController } from '../responsive/OrientationController';
import type { ViewportInfo } from '../responsive/ViewportInfo';

export interface DialogueSceneData {
  /** Id from dialogueScripts; defaults to the metro/Magician dialogue. */
  scriptId?: string;
  /** Forwarded untouched to the next scene, so level payloads survive. */
  payload?: Record<string, unknown>;
}

type DialoguePhase = 'slidingIn' | 'typing' | 'holding' | 'glitching' | 'slidingOut' | 'done';

/**
 * Inter-level dialogue, in the Hotline Miami presentation style: black bars top
 * and bottom, the scene on the left, a big talking portrait on the right
 * split by a diagonal seam, all four sliding into place at once.
 *
 * Content lives in `dialogue/dialogueScripts.ts` and pacing in
 * `dialogue/dialogueTiming.ts`, so adding another dialogue needs no changes
 * here beyond passing a different `scriptId`. Panel geometry lives in
 * `dialogue/dialogueLayoutMetrics.ts`, which this scene recomputes from
 * `this.cameras.main` every time `OrientationController` reports a layout
 * change, the same responsive pattern Berlin and Rhythm use — none of the
 * dialogue timing/typewriter/skip logic depends on layout at all.
 */
export class DialogueScene extends Phaser.Scene {
  private script!: DialogueScript;
  private payload: Record<string, unknown> = {};
  private panels!: DialoguePanels;
  private stationScene?: StationSceneView;
  /** Either the hand-drawn placeholder or a reusable 2-frame talking portrait, per this.script.portraitId. */
  private portrait?: MagicianPortrait | TalkingPortrait;
  private topBarShape!: Phaser.GameObjects.Rectangle;
  private topBarTitle!: Phaser.GameObjects.Text;
  private topBarContainer!: Phaser.GameObjects.Container;
  private bottomBarShape!: Phaser.GameObjects.Rectangle;
  private bottomBarContainer!: Phaser.GameObjects.Container;
  private divider!: Phaser.GameObjects.Graphics;
  private speakerText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private glitchOverlay!: Phaser.GameObjects.Rectangle;
  private skipHint!: Phaser.GameObjects.Text;
  private skipFill!: Phaser.GameObjects.Rectangle;
  private layout!: DialogueLayoutMetrics;
  private lineIndex = 0;
  private phase: DialoguePhase = 'slidingIn';
  private phaseStartedAt = 0;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private spaceHeldSince?: number;
  private finished = false;
  /** Dev-only visual layout editor; never created outside `import.meta.env.DEV`. */
  private editor?: SceneEditor;
  private editorKey?: Phaser.Input.Keyboard.Key;
  /** True while the SceneEditor is open; freezes dialogue progression, not the editor itself. */
  private dialoguePaused = false;
  /** this.time.now at the moment the editor opened, so resuming can shift phaseStartedAt by exactly how long it was open. */
  private pausedAtNow?: number;

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
    this.dialoguePaused = false;
    this.pausedAtNow = undefined;
  }

  create(): void {
    attachFullscreenExitControl(this);
    this.cameras.main.setBackgroundColor('#000000');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    this.layout = computeDialogueLayout(this.cameras.main.width, this.cameras.main.height);
    this.panels = new DialoguePanels(this);
    this.buildTopBar();
    this.buildBottomBar();
    this.buildScenePanel();
    this.buildPortraitPanel();
    this.buildDivider();

    this.glitchOverlay = this.add
      .rectangle(0, 0, this.layout.width, this.layout.height, DialoguePalette.glitch)
      .setOrigin(0, 0)
      .setDepth(DialogueDepth.GLITCH)
      .setAlpha(0);

    this.buildSkipHint();
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Built with OrientationController last, matching Berlin/Rhythm: it fires
    // an immediate onLayout pass, then one on every later viewport change.
    new OrientationController(this, {
      onLayout: (viewport) => this.applyResponsiveLayout(viewport),
    });

    this.panels.slideIn(() => {
      if (this.stationScene) {
        // The station scene's own departure/appearance sequence gates the
        // first line: it fires this once Disus has finished appearing.
        this.stationScene.playArrival(() => this.startLine(0));
      } else {
        this.startLine(0);
      }
    });

    void this.createDevelopmentTools();
  }

  /**
   * Dev-only: lets `?scene=dialogue` (or any dialogue launch) open the same
   * generic scene editor Berlin uses its own bespoke one for, registered
   * against the station scene's five objects. Guarded so production bundles
   * never include it, matching BerlinScene's `createDevelopmentTools`.
   */
  private async createDevelopmentTools(): Promise<void> {
    if (!import.meta.env.DEV) return;
    const { SceneEditor } = await import('../systems/SceneEditor');
    const editor = new SceneEditor(this, {
      onSave: (snapshot) => this.saveStationLayout(snapshot),
      onEnable: () => this.pauseDialogue(),
      onDisable: () => this.resumeDialogue(),
    });
    for (const object of this.stationScene?.getEditableObjects() ?? []) editor.register(object);
    this.editor = editor;
    this.editorKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  }

  /**
   * Freezes every time-based thing the dialogue drives — tweens (train
   * departure, glitch flashes, panel slides if mid-flight), delayed calls
   * (the stationary pause before departure, Disus's frame-by-frame
   * appearance), and this scene's own typewriter/hold/glitch state machine
   * and skip-hold — while leaving SceneEditor's own pointer/keyboard-driven
   * selection, drag, resize, nudge and save completely unaffected, since
   * none of those read the scene clock.
   */
  private pauseDialogue(): void {
    this.dialoguePaused = true;
    this.pausedAtNow = this.time.now;
    this.tweens.pauseAll();
    this.time.paused = true;
    // A skip-hold in progress when the editor opens shouldn't carry over.
    this.spaceHeldSince = undefined;
    this.skipFill.width = 0;
  }

  /** Resumes exactly where things left off; the paused duration never counts as elapsed dialogue time. */
  private resumeDialogue(): void {
    this.time.paused = false;
    this.tweens.resumeAll();
    if (this.pausedAtNow !== undefined) {
      this.phaseStartedAt += this.time.now - this.pausedAtNow;
      this.pausedAtNow = undefined;
    }
    this.dialoguePaused = false;
  }

  private saveStationLayout(
    snapshot: readonly { id: string; x: number; y: number; scaleX: number; scaleY: number }[],
  ): void {
    if (!this.stationScene) return;
    const layout = this.stationScene.buildLayoutFromSnapshot(snapshot);
    void fetch('/__dialogue-editor/save-station', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    }).catch((error: unknown) => {
      console.error('[DialogueScene] failed to save station layout', error);
    });
  }

  private buildScenePanel(): void {
    const { x, y, width, height } = this.layout.scenePanel;
    this.stationScene = new StationSceneView(
      this,
      width,
      height,
      undefined,
      // The seam leans right as it descends, so the station has to keep
      // rendering past its own vertical edge to stay behind the divider all
      // the way down. The panel's logical `width` is unchanged.
      DialogueLayout.dividerSkew + DialogueLayout.dividerThickness,
    );
    this.stationScene.root.setDepth(DialogueDepth.SCENE);
    this.panels.add('scene', this.stationScene.root, {
      restX: x,
      restY: y,
      // Enters from the left, entirely off-screen.
      offX: -width,
      offY: y,
    });
  }

  private buildPortraitPanel(): void {
    const { x, y, width, height } = this.layout.portraitPanel;
    // 'magician' has no talking-portrait config (it's not in speakerPortraits.ts),
    // so it keeps using the existing hand-drawn portrait untouched; any other
    // portraitId is a reusable 2-frame talking speaker.
    const talkingConfig = getSpeakerPortrait(this.script.portraitId);
    this.portrait = talkingConfig
      ? new TalkingPortrait(this, width, height, talkingConfig)
      : new MagicianPortrait(this, width, height);
    this.portrait.root.setDepth(DialogueDepth.PORTRAIT);
    this.panels.add('portrait', this.portrait.root, {
      restX: x,
      restY: y,
      // Enters from the right.
      offX: this.layout.width,
      offY: y,
    });
  }

  /** Strong diagonal seam that rides in with the portrait panel. */
  private buildDivider(): void {
    this.divider = this.add.graphics().setDepth(DialogueDepth.DIVIDER);
    this.redrawDivider();
    const { x, y } = this.layout.portraitPanel;
    this.panels.add('divider', this.divider, {
      restX: x,
      restY: y,
      offX: this.layout.width,
      offY: y,
    });
  }

  private redrawDivider(): void {
    const bodyHeight = this.layout.scenePanel.height;
    this.divider.clear();
    this.divider.fillStyle(DialoguePalette.dividerCore, 0.94);
    this.divider.fillPoints(
      this.toPoints(
        buildDiagonalStripPoints(DialogueLayout.dividerThickness, DialogueLayout.dividerSkew, bodyHeight),
      ),
      true,
    );
    this.divider.fillStyle(DialoguePalette.dividerAccent, 0.85);
    this.divider.fillPoints(
      this.toPoints(
        buildDiagonalStripPoints(
          DialogueLayout.dividerThickness * 0.22,
          DialogueLayout.dividerSkew,
          bodyHeight,
        ),
      ),
      true,
    );
  }

  private toPoints(flat: readonly number[]): Phaser.Geom.Point[] {
    const points: Phaser.Geom.Point[] = [];
    for (let index = 0; index < flat.length; index += 2) {
      points.push(new Phaser.Geom.Point(flat[index], flat[index + 1]));
    }
    return points;
  }

  private buildTopBar(): void {
    const { width, height } = this.layout.topBar;
    this.topBarShape = this.add.rectangle(0, 0, width, height, DialoguePalette.bar).setOrigin(0, 0);
    this.topBarTitle = this.add
      .text(DialogueLayout.textPaddingX, height / 2, 'BERLIN — UNDERGROUND', {
        fontFamily: 'Archivo Black',
        fontSize: '30px',
        color: '#ffdf57',
      })
      .setOrigin(0, 0.5);
    this.topBarContainer = this.add
      .container(0, 0, [this.topBarShape, this.topBarTitle])
      .setDepth(DialogueDepth.BARS);
    this.panels.add('topBar', this.topBarContainer, {
      restX: 0,
      restY: 0,
      offX: 0,
      // Enters from the top.
      offY: -height,
    });
  }

  private buildBottomBar(): void {
    const { width, height } = this.layout.bottomBar;
    this.bottomBarShape = this.add.rectangle(0, 0, width, height, DialoguePalette.bar).setOrigin(0, 0);
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
        fontSize: '26px',
        color: DialoguePalette.text,
        lineSpacing: 5,
      })
      .setOrigin(0, 0);
    this.bottomBarContainer = this.add
      .container(0, this.layout.bottomBar.y, [this.bottomBarShape, this.speakerText, this.bodyText])
      .setDepth(DialogueDepth.BARS);
    this.panels.add('bottomBar', this.bottomBarContainer, {
      restX: 0,
      restY: this.layout.bottomBar.y,
      offX: 0,
      // Enters from the bottom.
      offY: this.layout.height,
    });
  }

  private buildSkipHint(): void {
    const { width, height } = this.layout;
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

  /**
   * Recomputes every panel's geometry and reapplies it. Dialogue timing,
   * progression and skip behaviour are untouched — this only ever repositions
   * and resizes what is already on screen.
   */
  private applyResponsiveLayout(viewport: ViewportInfo): void {
    const layout = computeDialogueLayout(this.cameras.main.width, this.cameras.main.height);
    this.layout = layout;

    this.topBarShape.setSize(layout.topBar.width, layout.topBar.height);
    this.panels.updateGeometry('topBar', {
      restX: 0,
      restY: 0,
      offX: 0,
      offY: -layout.topBar.height,
    });

    this.bottomBarShape.setSize(layout.bottomBar.width, layout.bottomBar.height);
    this.panels.updateGeometry('bottomBar', {
      restX: 0,
      restY: layout.bottomBar.y,
      offX: 0,
      offY: layout.height,
    });

    this.stationScene?.resize(layout.scenePanel.width, layout.scenePanel.height);
    this.panels.updateGeometry('scene', {
      restX: layout.scenePanel.x,
      restY: layout.scenePanel.y,
      offX: -layout.scenePanel.width,
      offY: layout.scenePanel.y,
    });

    this.portrait?.resize(layout.portraitPanel.width, layout.portraitPanel.height);
    this.panels.updateGeometry('portrait', {
      restX: layout.portraitPanel.x,
      restY: layout.portraitPanel.y,
      offX: layout.width,
      offY: layout.portraitPanel.y,
    });

    this.redrawDivider();
    this.panels.updateGeometry('divider', {
      restX: layout.portraitPanel.x,
      restY: layout.portraitPanel.y,
      offX: layout.width,
      offY: layout.portraitPanel.y,
    });

    this.glitchOverlay.setSize(layout.width, layout.height);
    this.repositionSkipHint(layout, viewport);
    this.applyTextScale(viewport);
  }

  private repositionSkipHint(layout: DialogueLayoutMetrics, viewport: ViewportInfo): void {
    const x = layout.width - DialogueLayout.textPaddingX;
    this.skipHint.setPosition(x, layout.height - 26).setScale(viewport.hudScale);
    this.skipFill.setPosition(x, layout.height - 20);
    // The width itself tracks SPACE-hold progress each frame in updateSkip();
    // only the anchor moves here, and only while the hint is still showing.
    if (!this.skipHint.visible) this.skipFill.width = 0;
  }

  /** Matches the responsive scaling convention other HUDs use (viewport.hudScale). */
  private applyTextScale(viewport: ViewportInfo): void {
    this.speakerText.setScale(viewport.hudScale);
    this.bodyText.setScale(viewport.hudScale);
    this.topBarTitle.setScale(viewport.hudScale);
  }

  private startLine(index: number): void {
    this.lineIndex = index;
    this.bodyText.setText('');
    this.applySpeakerForCurrentLine();
    this.setPhase('typing');
  }

  /**
   * Resolves this line's speaker (its own `speakerId`, or the script's
   * default) and applies the matching name/portrait. A no-op speaker switch
   * inside TalkingPortrait.setSpeaker keeps repeated same-speaker lines from
   * resetting the talk animation.
   */
  private applySpeakerForCurrentLine(): void {
    const speakerId = this.currentLine.speakerId ?? this.script.portraitId;
    const config = getSpeakerPortrait(speakerId);
    this.speakerText.setText(this.currentLine.speakerName ?? config?.name ?? this.script.speaker);
    if (config && this.portrait instanceof TalkingPortrait) this.portrait.setSpeaker(config);
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
    this.stationScene?.update();
    if (this.editorKey && Phaser.Input.Keyboard.JustDown(this.editorKey)) this.editor?.toggle();
    this.editor?.update();
    if (this.dialoguePaused) return;

    if (this.portrait instanceof TalkingPortrait) {
      // The mouth flaps for as long as the line is on screen (typing it out
      // and then holding it to be read), and stops immediately otherwise —
      // "while a speaker's line is active" / "only the active speaker animates".
      const speaking = this.phase === 'typing' || this.phase === 'holding';
      this.portrait.setTalking(speaking, now);
    }
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
    const baseX = DialogueLayout.textPaddingX;
    this.bodyText.setX(baseX + 10);
    this.tweens.add({
      targets: this.bodyText,
      x: baseX,
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
    // Scene instances are reused across scene.start; a stale paused clock
    // would otherwise freeze every timer on the next time this scene runs.
    this.time.paused = false;
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.editor?.destroy();
    this.editor = undefined;
    this.stationScene?.destroy();
    this.portrait?.destroy();
    this.stationScene = undefined;
    this.portrait = undefined;
  }
}
