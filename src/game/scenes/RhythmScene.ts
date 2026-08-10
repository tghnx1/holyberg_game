import Phaser from 'phaser';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import type { ViewportInfo } from '../responsive/ViewportInfo';
import { parseChart } from '../rhythm/ChartLoader';
import { CompletionGate, getChartEndTimeMs, shouldCompleteChart } from '../rhythm/CompletionSystem';
import { DjActionManager } from '../rhythm/DjActionManager';
import { DjRhythmStrip } from '../rhythm/DjRhythmStrip';
import { beginDjGesture, finishDjGesture, getHeldAction, getHoldProgress, updateDjGesture } from '../rhythm/DjGesture';
import type { DjGestureSession } from '../rhythm/DjGesture';
import { DJ_GAMEPLAY_TOP_Y, getDjMixLayout } from '../rhythm/DjMixLayout';
import { AntiMashSystem, applyBadTap } from '../rhythm/InputPenaltySystem';
import { judgeTiming } from '../rhythm/JudgementSystem';
import { ProceduralBeat } from '../rhythm/ProceduralBeat';
import { RhythmClock } from '../rhythm/RhythmClock';
import { resetRhythmRunState } from '../rhythm/RhythmRunState';
import { applyJudgement, calculateAccuracy, getAwardedPoints, getMultiplier, initialScoreState } from '../rhythm/ScoreSystem';
import { createRhythmStartHandler } from '../rhythm/StartGate';
import { TutorialProgress } from '../rhythm/TutorialProgress';
import { BEGINNER_GRACE_MS, GLOBAL_INPUT_OFFSET_MS, RhythmDepth } from '../rhythm/constants';
import type { Judgement, RhythmAction, RhythmChart, ScoreState } from '../rhythm/types';

const ACTION_COLOR: Record<RhythmAction, number> = {
  tapLeft: 0xff8a3d,
  tapRight: 0x9d6cff,
  swipeLeft: 0xff477e,
  swipeRight: 0xff477e,
  holdFx: 0xffdd57,
};

export class RhythmScene extends Phaser.Scene {
  private berlinScore = 0;
  private chart!: RhythmChart;
  private scoreState!: ScoreState;
  private beat!: ProceduralBeat;
  private clock!: RhythmClock;
  private actions!: DjActionManager;
  private strip!: DjRhythmStrip;
  private playing = false;
  private finished = false;
  private lastBeat = -1;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private energyText!: Phaser.GameObjects.Text;
  private progressTrack!: Phaser.GameObjects.Rectangle;
  private progressBar!: Phaser.GameObjects.Rectangle;
  private judgementText!: Phaser.GameObjects.Text;
  private clubRoot!: Phaser.GameObjects.Container;
  private actionRoot!: Phaser.GameObjects.Container;
  private tutorialRoot!: Phaser.GameObjects.Container;
  private stageFlash!: Phaser.GameObjects.Rectangle;
  private clubDim!: Phaser.GameObjects.Rectangle;
  private activeOverlay?: Phaser.GameObjects.Container;
  private tutorial?: TutorialProgress;
  private tutorialReady = false;
  private tutorialNote?: Phaser.GameObjects.Container;
  private tutorialPrompt?: Phaser.GameObjects.Text;
  private tutorialHint?: Phaser.GameObjects.Text;
  private audioUnlocked = false;
  private completionGate!: CompletionGate;
  private chartEndTimeMs = 0;
  private readonly inputGuard = { reset: () => this.gestures.clear() };
  private readonly antiMash = new AntiMashSystem();
  private readonly gestures = new Map<number, DjGestureSession>();
  /** InputManager pointers are global and must be added only once per scene instance. */
  private touchPointersAdded = false;

  private get centerX(): number {
    return this.cameras.main.width / 2;
  }

  constructor() { super('RhythmScene'); }

  init(data: { score?: number }): void {
    this.berlinScore = data.score ?? 0;
    this.resetForNewRun();
  }

  private resetForNewRun(): void {
    const reset = resetRhythmRunState(this.inputGuard, this.antiMash);
    this.playing = reset.playing;
    this.finished = reset.finished;
    this.lastBeat = reset.lastBeat;
    this.tutorialReady = reset.tutorialReady;
    this.tutorial = reset.tutorial;
    this.tutorialNote = reset.tutorialNote;
    this.tutorialPrompt = reset.tutorialPrompt;
    this.tutorialHint = undefined;
    this.audioUnlocked = false;
    this.activeOverlay = undefined;
  }

  preload(): void {
    this.load.json('holyberg-demo-chart', 'charts/demo.json');
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.error(`[RhythmScene] failed to load ${file.key} from ${file.url}`);
    });
  }

  create(): void {
    attachFullscreenExitControl(this);
    try {
      this.build();
    } catch (error) {
      this.showFatalError(error);
    }
  }

  private showFatalError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[RhythmScene] failed to start', error);
    const camera = this.cameras.main;
    camera.setBackgroundColor('#12060c');
    this.add.text(camera.width / 2, camera.height / 2, `RHYTHM STAGE FAILED TO LOAD\n\n${message}`, {
      fontFamily: 'Space Mono', fontSize: '18px', color: '#ff8a8a', align: 'center', wordWrap: { width: camera.width - 80 },
    }).setOrigin(0.5).setScrollFactor(0);
  }

  private build(): void {
    this.chart = parseChart(this.cache.json.get('holyberg-demo-chart'));
    this.scoreState = initialScoreState();
    this.completionGate = new CompletionGate();
    this.chartEndTimeMs = getChartEndTimeMs(this.chart.durationMs, this.chart.notes);
    this.beat = new ProceduralBeat(this.chart.bpm, this.chart.durationMs);
    this.clock = new RhythmClock(this.beat);
    this.cameras.main.setBackgroundColor('#07040d');
    this.createClub();
    this.strip = new DjRhythmStrip(this);
    this.strip.refreshGeometry(this.centerX);
    this.actionRoot = this.add.container(0, 0).setDepth(RhythmDepth.NOTES);
    this.tutorialRoot = this.add.container(this.centerX, 0).setDepth(RhythmDepth.UI);
    this.actions = new DjActionManager(this, this.chart.notes, this.actionRoot);
    this.actions.setCenterX(this.centerX);
    this.createHud();
    this.bindKeyboardInput();
    this.bindPointerInput();
    this.createStartOverlay();
    new OrientationController(this, {
      onPause: () => { this.clock.pause(); void this.beat.pause(); },
      onResume: () => { void this.beat.resume().then((resumed) => { if (resumed) this.clock.resume(); }); },
      onLayout: (viewport) => this.applyResponsiveLayout(viewport),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  private createClub(): void {
    this.clubRoot = this.add.container(this.centerX, 0).setDepth(RhythmDepth.CLUB_BACKGROUND);
    this.clubRoot.add(this.add.rectangle(0, 274, 1120, 548, 0x0b0712, 1));
    this.stageFlash = this.add.rectangle(0, 274, 1100, 548, 0x8f2677, 0);
    this.clubDim = this.add.rectangle(0, 274, 1120, 548, 0x020106, 0);
    this.clubRoot.add(this.stageFlash);

    const texture = this.add.graphics();
    texture.lineStyle(1, 0x6f3a78, 0.13);
    for (let y = 38; y < 546; y += 34) texture.lineBetween(-550, y, 550, y);
    for (let x = -540; x <= 540; x += 54) texture.lineBetween(x, 20, x, 546);
    this.clubRoot.add(texture);

    const beams = this.add.graphics();
    beams.fillStyle(0x9d6cff, 0.13).fillTriangle(-470, 20, -180, 545, -20, 545);
    beams.fillStyle(0xff477e, 0.12).fillTriangle(470, 20, 20, 545, 230, 545);
    beams.fillStyle(0xffdd57, 0.07).fillTriangle(0, 0, -100, 540, 100, 540);
    this.clubRoot.add(beams);

    for (const x of [-440, 440]) {
      this.clubRoot.add(this.add.rectangle(x, 270, 118, 370, 0x09060f).setStrokeStyle(4, 0x281a31));
      this.clubRoot.add(this.add.circle(x, 185, 38, 0x15101c).setStrokeStyle(3, 0x40304a, 0.7));
      this.clubRoot.add(this.add.circle(x, 285, 46, 0x15101c).setStrokeStyle(3, 0x40304a, 0.7));
    }

    this.clubRoot.add(this.add.circle(0, 196, 37, 0x18101e).setStrokeStyle(5, 0xffdd57, 0.55));
    this.clubRoot.add(this.add.rectangle(0, 270, 84, 105, 0x160d1d));
    this.clubRoot.add(this.add.rectangle(0, 342, 430, 92, 0x171020).setStrokeStyle(4, 0xff477e, 0.55));
    this.clubRoot.add(this.add.text(0, 340, 'HOLYBERG', { fontFamily: 'Archivo Black', fontSize: '31px', color: '#ffdd57' }).setOrigin(0.5));

    for (let index = 0; index < 22; index += 1) {
      const crowd = this.add.ellipse(-535 + index * 51, 525, 55, 76 + (index % 4) * 12, 0x160b20);
      this.clubRoot.add(crowd);
      this.tweens.add({ targets: crowd, y: `-=${5 + (index % 4) * 2}`, yoyo: true, repeat: -1, duration: 390 + index * 13 });
    }
    this.clubRoot.add(this.clubDim);
  }

  private createHud(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Space Mono', fontSize: '17px', color: '#fff', stroke: '#090611', strokeThickness: 5 };
    this.add.text(22, 18, this.chart.title, { ...style, color: '#ffdd57' }).setDepth(RhythmDepth.UI);
    this.add.text(22, 48, `BERLIN  ${this.berlinScore}`, style).setDepth(RhythmDepth.UI);
    this.scoreText = this.add.text(22, 76, '', style).setDepth(RhythmDepth.UI);
    this.comboText = this.add.text(this.centerX, 38, '', { ...style, align: 'center' }).setOrigin(0.5).setDepth(RhythmDepth.UI);
    this.energyText = this.add.text(this.cameras.main.width - 22, 20, '', { ...style, align: 'right' }).setOrigin(1, 0).setDepth(RhythmDepth.UI);
    this.progressTrack = this.add.rectangle(this.centerX, 12, 500, 7, 0x2a1836).setDepth(RhythmDepth.UI);
    this.progressBar = this.add.rectangle(this.centerX - 250, 12, 0, 7, 0xffdd57).setOrigin(0, 0.5).setDepth(RhythmDepth.UI);
    this.judgementText = this.add.text(this.centerX, 510, '', { fontFamily: 'Archivo Black', fontSize: '42px', color: '#fff', stroke: '#541864', strokeThickness: 7 }).setOrigin(0.5).setAlpha(0).setDepth(RhythmDepth.UI);
    this.updateHud();
  }

  private createStartOverlay(): void {
    const background = this.add.rectangle(0, this.cameras.main.height / 2, 760, 250, 0x090611, 0.96).setStrokeStyle(5, 0xff477e).setInteractive();
    const text = this.add.text(0, this.cameras.main.height / 2, 'GET ON THE DECKS\n\nTAP OR PRESS SPACE', { fontFamily: 'Archivo Black', fontSize: '38px', color: '#ffdd57', align: 'center', lineSpacing: 12 }).setOrigin(0.5);
    const overlay = this.add.container(this.centerX, 0, [background, text]).setDepth(RhythmDepth.UI);
    this.activeOverlay = overlay;
    let start = (): void => undefined;
    start = createRhythmStartHandler({
      unlockAudio: async () => {
        const unlocked = await this.beat.unlock();
        this.audioUnlocked = unlocked;
        return unlocked;
      },
      cleanupListeners: () => {
        this.input.off('pointerdown', start);
        this.input.keyboard?.off('keydown-SPACE', start);
      },
      startTutorial: () => {
        background.disableInteractive();
        overlay.destroy(true);
        if (this.activeOverlay === overlay) this.activeOverlay = undefined;
        this.startTutorial();
      },
      onAudioUnlockFailure: (error) => {
        if (import.meta.env.DEV) console.warn('[RhythmScene] audio unlock failed', error);
      },
    });
    this.input.on('pointerdown', start);
    this.input.keyboard?.on('keydown-SPACE', start);
  }

  private bindKeyboardInput(): void {
    const bindings: Array<[string, RhythmAction]> = [
      ['A', 'tapLeft'], ['LEFT', 'tapLeft'], ['D', 'tapRight'], ['RIGHT', 'tapRight'],
      ['Q', 'swipeLeft'], ['E', 'swipeRight'], ['F', 'holdFx'], ['SPACE', 'holdFx'],
    ];
    for (const [key, action] of bindings) this.input.keyboard?.on(`keydown-${key}`, () => this.acceptAction(action));
  }

  private bindPointerInput(): void {
    if (!this.touchPointersAdded) {
      this.input.addPointer(3);
      this.touchPointersAdded = true;
    }
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if ((!this.tutorial && !this.playing) || pointer.y < DJ_GAMEPLAY_TOP_Y) return;
      this.gestures.set(pointer.id, beginDjGesture(pointer.x, pointer.y, this.time.now));
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const gesture = this.gestures.get(pointer.id);
      if (!gesture) return;
      const action = updateDjGesture(gesture, pointer.x, pointer.y);
      if (!action) return;
      gesture.resolved = true;
      this.acceptAction(action);
    });
    const finishPointer = (pointer: Phaser.Input.Pointer): void => {
      const gesture = this.gestures.get(pointer.id);
      if (!gesture) return;
      const action = finishDjGesture(gesture, pointer.x, pointer.y, this.time.now, this.centerX);
      if (action) this.acceptAction(action);
      this.gestures.delete(pointer.id);
      this.updateHoldMeter();
    };
    this.input.on('pointerup', finishPointer);
    this.input.on('pointerupoutside', finishPointer);
  }

  private startTutorial(): void {
    this.tutorial = new TutorialProgress();
    this.showTutorialCue();
  }

  private showTutorialCue(): void {
    const action = this.tutorial?.currentAction;
    if (!action) {
      this.destroyTutorialCue();
      this.scoreState = initialScoreState();
      this.antiMash.reset();
      this.updateHud();
      const background = this.add.rectangle(0, this.cameras.main.height / 2, 500, 210, 0x090611, 0.9);
      const text = this.add.text(0, this.cameras.main.height / 2, 'READY', { fontFamily: 'Archivo Black', fontSize: '58px', color: '#ffdd57' }).setOrigin(0.5);
      const overlay = this.add.container(this.centerX, 0, [background, text]).setDepth(RhythmDepth.UI);
      this.activeOverlay = overlay;
      this.runCountdown(overlay, background, text);
      return;
    }

    this.destroyTutorialCue();
    this.tutorialReady = false;
    const prompt = action === 'tapLeft' ? 'TAP LEFT' : action === 'tapRight' ? 'TAP RIGHT' : action === 'holdFx' ? 'HOLD FOR FX' : 'SWIPE TO MIX';
    const hint = action === 'tapLeft' || action === 'tapRight' ? 'TAP ANYWHERE ON THIS HALF' : action === 'holdFx' ? 'PRESS AND HOLD' : 'SLIDE YOUR FINGER SIDEWAYS';
    this.tutorialPrompt = this.add.text(this.centerX, 118, prompt, { fontFamily: 'Archivo Black', fontSize: '43px', color: '#ffffff', stroke: '#34103e', strokeThickness: 9 }).setOrigin(0.5).setDepth(RhythmDepth.UI);
    this.tutorialHint = this.add.text(this.centerX, 164, hint, { fontFamily: 'Space Mono', fontSize: '16px', fontStyle: 'bold', color: '#ffdd57' }).setOrigin(0.5).setDepth(RhythmDepth.UI);

    const layout = getDjMixLayout(0);
    const cueX = action === 'tapLeft' ? layout.leftMarkerX : action === 'tapRight' ? layout.rightMarkerX : 0;
    const cueLabel = action === 'tapLeft' ? 'LEFT' : action === 'tapRight' ? 'RIGHT' : action === 'holdFx' ? 'HOLD' : '←   SWIPE   →';
    const cueWidth = action === 'tapLeft' || action === 'tapRight' ? 126 : 300;
    const shape = this.add.rectangle(0, 0, cueWidth, 76, ACTION_COLOR[action], 0.96).setStrokeStyle(5, 0xffffff, 0.9);
    const label = this.add.text(0, 0, cueLabel, { fontFamily: 'Archivo Black', fontSize: '25px', color: '#100818' }).setOrigin(0.5);
    this.tutorialNote = this.add.container(cueX, layout.stripCenterY, [shape, label]);
    this.tutorialRoot.add(this.tutorialNote);
    if (action === 'swipeRight') {
      this.tweens.add({ targets: this.tutorialNote, x: `+=${120}`, yoyo: true, repeat: -1, duration: 550, ease: 'Sine.inOut' });
    } else {
      this.tweens.add({ targets: this.tutorialNote, scale: 1.1, yoyo: true, repeat: -1, duration: 470, ease: 'Sine.inOut' });
    }
    this.time.delayedCall(420, () => { this.tutorialReady = true; });
  }

  private destroyTutorialCue(): void {
    if (this.tutorialNote) this.tweens.killTweensOf(this.tutorialNote);
    this.tutorialNote?.destroy(true);
    this.tutorialPrompt?.destroy();
    this.tutorialHint?.destroy();
    this.tutorialNote = undefined;
    this.tutorialPrompt = undefined;
    this.tutorialHint = undefined;
  }

  private runCountdown(overlay: Phaser.GameObjects.Container, background: Phaser.GameObjects.Rectangle, text: Phaser.GameObjects.Text): void {
    background.setAlpha(0.84);
    ['3', '2', '1', 'DROP'].forEach((step, index) => this.time.delayedCall(index * 650, () => text.setText(step)));
    this.time.delayedCall(2600, () => {
      overlay.destroy(true);
      if (this.activeOverlay === overlay) this.activeOverlay = undefined;
      const audioRunning = this.beat.start();
      this.clock.start(!(audioRunning || this.audioUnlocked));
      this.playing = true;
    });
  }

  private acceptAction(action: RhythmAction): void {
    if (!this.tutorial && !this.playing) return;
    this.strip.flashAction(action, ACTION_COLOR[action]);
    if (this.tutorial && !this.tutorial.complete) {
      const expected = this.tutorial.currentAction;
      const tutorialAction = expected === 'swipeRight' && (action === 'swipeLeft' || action === 'swipeRight') ? expected : action;
      if (this.tutorialReady && this.tutorial.hit(tutorialAction)) this.showTutorialCue();
      return;
    }
    if (!this.playing || this.finished) return;
    const inputTime = this.clock.currentTimeMs + GLOBAL_INPUT_OFFSET_MS;
    const note = this.actions.nearestPending(action, inputTime);
    const judgement = note ? judgeTiming(inputTime - note.timeMs) : null;
    if (!note || !judgement) {
      this.registerBadAction();
      return;
    }
    this.actions.resolve(note, 'hit');
    this.registerJudgement(judgement, action, !this.antiMash.isLocked(this.clock.currentTimeMs));
  }

  private registerBadAction(): void {
    const now = this.clock.currentTimeMs;
    this.scoreState = applyBadTap(this.scoreState);
    this.updateHud();
    this.showJudgementText('BAD MOVE -40', '#ff334f', 25);
    if (this.antiMash.recordBadTap(now)) this.showJudgementText('SLOW DOWN', '#ff334f', 30, 620);
  }

  private registerJudgement(judgement: Judgement, action?: RhythmAction, scoringEnabled = true): void {
    const awardedPoints = scoringEnabled ? getAwardedPoints(this.scoreState, judgement) : 0;
    const protectEnergy = judgement === 'MISS' && this.clock.currentTimeMs < BEGINNER_GRACE_MS;
    this.scoreState = applyJudgement(this.scoreState, judgement, protectEnergy, scoringEnabled);
    if (action) this.strip.flashAction(action, judgement === 'PERFECT' ? 0xffffff : ACTION_COLOR[action]);
    const feedback = judgement === 'MISS' ? 'MISS' : `${judgement}\n+${awardedPoints}`;
    const color = judgement === 'PERFECT' ? '#ffffff' : judgement === 'EXCELLENT' ? '#ffdd57' : judgement === 'GOOD' ? '#ff8a3d' : '#ff3f5e';
    this.showJudgementText(feedback, color, judgement === 'MISS' ? 27 : judgement === 'PERFECT' ? 42 : judgement === 'EXCELLENT' ? 37 : 32);
    this.reactClub(judgement);
    this.updateHud();
  }

  private showJudgementText(text: string, color: string, fontSize: number, delay = 0): void {
    this.judgementText.setText(text).setFontSize(fontSize).setColor(color).setAlpha(1).setScale(text.startsWith('PERFECT') ? 1.18 : 1);
    this.tweens.killTweensOf(this.judgementText);
    this.tweens.add({ targets: this.judgementText, alpha: 0, scale: 1, delay, duration: 300 });
  }

  private reactClub(judgement: Judgement): void {
    if (judgement === 'MISS') {
      this.clubDim.setAlpha(0.42);
      this.tweens.add({ targets: this.clubDim, alpha: 0, duration: 240 });
      this.cameras.main.shake(90, 0.003);
      return;
    }
    const strong = judgement === 'PERFECT' || this.scoreState.combo >= 10;
    this.stageFlash.setFillStyle(strong ? 0xff477e : 0x9d6cff).setAlpha(strong ? 0.38 : 0.18);
    this.tweens.add({ targets: this.stageFlash, alpha: 0, duration: strong ? 230 : 150 });
    this.strip.pulse(strong);
  }

  private updateHud(): void {
    this.scoreText.setText(`RHYTHM  ${this.scoreState.score}`);
    this.comboText.setText(`${this.scoreState.combo} COMBO   x${getMultiplier(this.scoreState.combo)}`);
    this.energyText.setText(`CROWD ENERGY\n${this.scoreState.energy}%`);
  }

  private updateHoldGestures(): void {
    let maxProgress = 0;
    for (const gesture of this.gestures.values()) {
      maxProgress = Math.max(maxProgress, getHoldProgress(gesture, this.time.now));
      if (!getHeldAction(gesture, this.time.now)) continue;
      gesture.resolved = true;
      this.acceptAction('holdFx');
    }
    this.strip.setHoldProgress(maxProgress);
  }

  private updateHoldMeter(): void {
    let maxProgress = 0;
    for (const gesture of this.gestures.values()) maxProgress = Math.max(maxProgress, getHoldProgress(gesture, this.time.now));
    this.strip.setHoldProgress(maxProgress);
  }

  private applyResponsiveLayout(viewport: ViewportInfo): void {
    const centerX = this.centerX;
    this.clubRoot.setX(centerX);
    this.strip.refreshGeometry(centerX);
    this.actions.setCenterX(centerX);
    this.tutorialRoot.setX(centerX);
    this.progressTrack.setX(centerX);
    this.progressBar.setX(centerX - 250);
    this.comboText.setX(centerX).setScale(viewport.hudScale);
    this.energyText.setX(this.cameras.main.width - 22).setScale(viewport.hudScale);
    this.scoreText.setScale(viewport.hudScale);
    this.judgementText.setX(centerX).setScale(viewport.hudScale);
    this.activeOverlay?.setX(centerX);
    this.tutorialPrompt?.setX(centerX);
    this.tutorialHint?.setX(centerX);
  }

  private endLevel(): void {
    if (this.finished) return;
    this.finished = true;
    this.playing = false;
    this.clock.stop();
    this.beat.stop();
    const completeText = this.add.text(0, 310, 'SET COMPLETE', { fontFamily: 'Archivo Black', fontSize: '58px', color: '#ffdd57', stroke: '#451452', strokeThickness: 9 }).setOrigin(0.5);
    const overlay = this.add.container(this.centerX, 0, [completeText]).setDepth(RhythmDepth.UI);
    this.activeOverlay = overlay;
    this.time.delayedCall(1500, () => {
      overlay.destroy(true);
      if (this.activeOverlay === overlay) this.activeOverlay = undefined;
      this.scene.start('ResultScene', { ...this.scoreState, berlinScore: this.berlinScore, accuracy: calculateAccuracy(this.scoreState), success: true });
    });
  }

  private cleanup(): void {
    this.playing = false;
    this.clock?.stop();
    this.beat?.stop();
    this.time.removeAllEvents();
    this.input.removeAllListeners();
    this.input.keyboard?.removeAllListeners();
    this.gestures.clear();
    this.tutorial = undefined;
    this.tutorialNote = undefined;
    this.tutorialPrompt = undefined;
    this.tutorialHint = undefined;
  }

  update(): void {
    if (this.tutorial || this.playing) this.updateHoldGestures();
    if (!this.playing || this.finished) return;
    const time = this.clock.currentTimeMs;
    const missed = this.actions.update(time);
    for (let index = 0; index < missed.length; index += 1) this.registerJudgement('MISS');
    this.progressBar.displayWidth = 500 * Phaser.Math.Clamp(time / this.chart.durationMs, 0, 1);
    const beatIndex = Math.floor(time / (60000 / this.chart.bpm));
    if (beatIndex !== this.lastBeat) {
      this.lastBeat = beatIndex;
      const strong = beatIndex % 4 === 0 || this.scoreState.combo >= 10;
      this.stageFlash.setAlpha(strong ? 0.2 : 0.08);
      this.tweens.add({ targets: this.stageFlash, alpha: 0, duration: 170 });
      this.strip.pulse(strong);
    }
    this.completionGate.tryComplete(shouldCompleteChart(time, this.chartEndTimeMs), () => this.endLevel());
  }
}
