import Phaser from 'phaser';
import { gameAudio } from '../audio/GameAudio';
import { queueSceneAudio } from '../audio/gameAudioCatalog';
import { DESIGN_WIDTH } from '../constants';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import type { ViewportInfo } from '../responsive/ViewportInfo';
import { AudioTrackPlayer } from '../rhythm/AudioTrackPlayer';
import { SoundManager } from '../audio/SoundManager';
import type { PausableScene } from '../systems/pause/PausableScene';
import { readInputOffsetMs } from '../rhythm/Calibration';
import { HIT_LINE_HALF_WIDTH, LANE_COLORS, LANE_LABELS, RHYTHM_SCORE_CAP, RhythmDepth, SPAWN_AHEAD_SECONDS } from '../rhythm/constants';
import { HIT_LINE_Y, HORIZON_HALF_WIDTH, HORIZON_Y, PAD_BOTTOM_Y } from '../rhythm/constants';
import { CompletionGate, shouldCompleteTrack } from '../rhythm/CompletionSystem';
import { AntiMashSystem, applyBadTap, LaneInputGuard } from '../rhythm/InputPenaltySystem';
import { formatChartStatistics, getBeatIndexAtTime, parseMidiChart } from '../rhythm/MidiChartLoader';
import { NoteManager } from '../rhythm/NoteManager';
import { RhythmClock } from '../rhythm/RhythmClock';
import { RhythmEngine } from '../rhythm/RhythmEngine';
import { RhythmBoothAnimation } from '../rhythm/RhythmBoothAnimation';
import { RhythmHighway } from '../rhythm/RhythmHighway';
import { RhythmMixer } from '../rhythm/RhythmMixer';
import { getRhythmPlaybackProgress, resolveRhythmPlaybackWindow, selectRhythmNotesInWindow } from '../rhythm/RhythmPlaybackWindow';
import {
  getRhythmAssetLayout,
  RHYTHM_DECK_HEIGHT,
  RHYTHM_DECK_TEXTURE_KEY,
  RHYTHM_DECK_WIDTH,
} from '../rhythm/RhythmAssetLayout';
import { resetRhythmRunState } from '../rhythm/RhythmRunState';
import { getJudgementPadGeometry, getLaneBoundaries } from '../rhythm/PerspectiveMath';
import { getTouchArea, mapLogicalPointerToLane } from '../rhythm/TouchLaneMapper';
import { TutorialProgress } from '../rhythm/TutorialProgress';
import { applyJudgement, calculateAccuracy, getAwardedPoints, getMultiplier, initialScoreState } from '../rhythm/ScoreSystem';
import { createRhythmStartHandler } from '../rhythm/StartGate';
import { parseTrackMetadata } from '../rhythm/TrackLoader';
import { MAIN_RHYTHM_TRACK } from '../rhythm/TrackRegistry';
import type { Judgement, Lane, RhythmChart, ScoreState } from '../rhythm/types';
import type { RhythmPlaybackWindow } from '../rhythm/RhythmPlaybackWindow';
import type { LevelCompleteSceneData } from './LevelCompleteScene';
import {
  buildPostRhythmDialogue,
  resolveClubStoryCast,
  type ClubStoryCast,
} from '../level/club/clubStory';
import type { CurrentSceneSnapshot } from '../dialogue/currentSceneSnapshot';
import { prefetchNextLevel } from '../systems/campaignPrefetch';
import { getRuntimeAssetQualityProfile } from '../responsive/AssetQuality';

export class RhythmScene extends Phaser.Scene implements PausableScene {
  private berlinScore = 0;
  private clubStoryCast!: ClubStoryCast;
  /** The actual final Club room, retained before this scene was entered. */
  private clubStageSnapshot?: CurrentSceneSnapshot;
  private unsubscribeSoundManager?: () => void;
  private chart!: RhythmChart;
  private playbackWindow!: RhythmPlaybackWindow;
  private scoreState!: ScoreState;
  private audio!: AudioTrackPlayer;
  private clock!: RhythmClock;
  private engine!: RhythmEngine;
  private notes!: NoteManager;
  private highway!: RhythmHighway;
  private playing = false;
  private starting = false;
  private finished = false;
  private lastBeat = -1;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Rectangle;
  private judgementText!: Phaser.GameObjects.Text;
  private stageFlash!: Phaser.GameObjects.Rectangle;
  private clubBeams!: Phaser.GameObjects.Graphics;
  private clubMissOverlay!: Phaser.GameObjects.Rectangle;
  private crowdMembers: Phaser.GameObjects.Ellipse[] = [];
  private clubRoot!: Phaser.GameObjects.Container;
  private deckRoot!: Phaser.GameObjects.Container;
  private leftDeck!: Phaser.GameObjects.Image;
  private rightDeck!: Phaser.GameObjects.Image;
  private boothAnimation!: RhythmBoothAnimation;
  private mixer!: RhythmMixer;
  private noteRoot!: Phaser.GameObjects.Container;
  private highwayForeground!: Phaser.GameObjects.Graphics;
  private tutorialRoot!: Phaser.GameObjects.Container;
  private feedbackRoot!: Phaser.GameObjects.Container;
  private progressTrack!: Phaser.GameObjects.Rectangle;
  private touchInstruction?: Phaser.GameObjects.Text;
  private activeOverlay?: Phaser.GameObjects.Container;
  private touchLabels: Phaser.GameObjects.Text[] = [];
  private tutorial?: TutorialProgress;
  private tutorialReady = false;
  private tutorialNote?: Phaser.GameObjects.Container;
  private tutorialPrompt?: Phaser.GameObjects.Text;
  private hitHere!: Phaser.GameObjects.Text;
  private touchDebug!: Phaser.GameObjects.Graphics;
  private touchDebugText!: Phaser.GameObjects.Text;
  private touchDebugVisible = false;
  private rhythmDebugText!: Phaser.GameObjects.Text;
  private rhythmDebugVisible = false;
  private inputOffsetMs = 0;
  private lastTimingDifferenceMs: number | null = null;
  private audioEnded = false;
  private completionGate!: CompletionGate;
  private readonly inputGuard = new LaneInputGuard();
  private readonly antiMash = new AntiMashSystem();
  private debugPointer = { x: 0, y: 0, lane: null as Lane | null };
  /** InputManager pointers are global and must be added only once per scene instance. */
  private touchPointersAdded = false;

  private get centerX(): number {
    return this.cameras.main.width / 2;
  }

  constructor() { super('RhythmScene'); }
  init(data: {
    score?: number;
    clubStoryCast?: ClubStoryCast;
    clubStageSnapshot?: CurrentSceneSnapshot;
  }): void {
    this.berlinScore = data.score ?? 0;
    this.clubStoryCast = data.clubStoryCast ?? resolveClubStoryCast();
    this.clubStageSnapshot = data.clubStageSnapshot;
    this.resetForNewRun();
  }

  private resetForNewRun(): void {
    // Cleared here as well as in build(): Phaser reuses one scene instance
    // across restarts, so a run whose build never completed (a failed track
    // load, a fatal error overlay) would otherwise leave the previous run's
    // score — and, before it was bounded, its bad-tap penalty — in place for
    // the next attempt. build() sets the real note count immediately after.
    this.scoreState = initialScoreState(this.chart?.notes.length);
    const reset = resetRhythmRunState(this.inputGuard, this.antiMash);
    this.playing = reset.playing;
    this.starting = reset.starting;
    this.finished = reset.finished;
    this.lastBeat = reset.lastBeat;
    this.tutorialReady = reset.tutorialReady;
    this.tutorial = reset.tutorial;
    this.tutorialNote = reset.tutorialNote;
    this.tutorialPrompt = reset.tutorialPrompt;
    this.touchLabels = [];
    this.touchDebugVisible = false;
    this.debugPointer = { x: 0, y: 0, lane: null };
    this.rhythmDebugVisible = false;
    this.inputOffsetMs = readInputOffsetMs(
      typeof window === 'undefined' ? undefined : window.localStorage,
    );
    this.lastTimingDifferenceMs = null;
    this.audioEnded = false;
  }
  preload(): void {
    queueSceneAudio(this, 'RhythmScene');
    this.load.json('rhythm-track-metadata', MAIN_RHYTHM_TRACK.metadataUrl);
    this.load.binary('rhythm-track-midi', MAIN_RHYTHM_TRACK.midiUrl);
    this.load.binary('rhythm-track-audio', MAIN_RHYTHM_TRACK.audioUrl);
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.error(`[RhythmScene] failed to load ${file.key} from ${file.url}`);
    });
  }

  create(): void {
    // Rhythm owns its dedicated Web Audio track; no general soundtrack may overlap it.
    gameAudio(this).stopMusic();
    attachFullscreenExitControl(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.cameras.main.setBackgroundColor('#07040d');
    const loading = this.add
      .text(this.centerX, this.cameras.main.height / 2, 'LOADING TRACK', {
        fontFamily: 'Archivo Black',
        fontSize: '38px',
        color: '#ffdd57',
      })
      .setOrigin(0.5);
    void this.prepareTrack(loading);
  }

  private showFatalError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[RhythmScene] failed to start', error);
    const camera = this.cameras.main;
    camera.setBackgroundColor('#12060c');
    this.add
      .text(camera.width / 2, camera.height / 2, `TRACK FAILED TO LOAD\n\n${message}`, {
        fontFamily: 'Space Mono',
        fontSize: '18px',
        color: '#ff8a8a',
        align: 'center',
        wordWrap: { width: camera.width - 80 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
  }

  private async prepareTrack(loading: Phaser.GameObjects.Text): Promise<void> {
    try {
      const metadata = parseTrackMetadata(
        this.cache.json.get('rhythm-track-metadata'),
        MAIN_RHYTHM_TRACK,
      );
      const midiBuffer = this.getBinaryAsset('rhythm-track-midi');
      const audioBuffer = this.getBinaryAsset('rhythm-track-audio');
      this.chart = parseMidiChart(
        midiBuffer,
        metadata,
        import.meta.env.DEV ? (message) => console.warn(message) : () => undefined,
      );
      this.audio = new AudioTrackPlayer();
      await this.audio.prepare(audioBuffer);
      this.unsubscribeSoundManager = SoundManager.onChange((muted) => this.audio.setMuted(muted));
      // prepare() detaches the buffer, so the cached copy is now an empty
      // shell that nothing can decode. Dropping it frees the encoded track
      // (several MB held for the whole level) and makes a retry re-request
      // the file — served from the HTTP cache — instead of finding a
      // detached entry it cannot use.
      this.cache.binary.remove('rhythm-track-audio');
      if (!this.scene.isActive()) return;
      this.playbackWindow = resolveRhythmPlaybackWindow(metadata, this.audio.durationSeconds);
      this.chart = { ...this.chart, notes: selectRhythmNotesInWindow(this.chart.notes, this.playbackWindow.startSeconds, this.playbackWindow.endSeconds) };
      this.audio.onEnded = () => {
        this.audioEnded = true;
        if (!this.engine) return;
        for (const note of this.engine.missRemaining()) {
          this.notes.resolve(note.id);
          this.registerJudgement('MISS');
        }
      };
      loading.destroy();
      if (import.meta.env.DEV) console.debug(formatChartStatistics(this.chart));
      this.build();
    } catch (error) {
      loading.destroy();
      this.showFatalError(error);
    }
  }

  private getBinaryAsset(key: string): ArrayBuffer {
    const value: unknown = this.cache.binary.get(key);
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) {
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
    }
    throw new Error(`Track asset "${key}" is missing or not binary data`);
  }

  private build(): void {
    this.scoreState = initialScoreState(this.chart.notes.length);
    this.completionGate = new CompletionGate();
    this.engine = new RhythmEngine(this.chart.notes);
    this.clock = new RhythmClock(this.audio);
    this.cameras.main.setBackgroundColor('#07040d');
    this.createClub();
    this.createDecks();
    this.mixer = new RhythmMixer(this, this.centerX);
    this.boothAnimation = new RhythmBoothAnimation(this, this.centerX, this.leftDeck, this.rightDeck);
    this.highway = new RhythmHighway(this);
    this.highway.refreshGeometry(this.centerX);
    this.highwayForeground = this.add.graphics().setDepth(RhythmDepth.NOTES - 1);
    this.drawHighwayForeground();
    this.noteRoot = this.add.container(0, 0).setDepth(RhythmDepth.NOTES);
    this.tutorialRoot = this.add.container(this.centerX, 0).setDepth(RhythmDepth.NOTES);
    this.feedbackRoot = this.add.container(this.centerX, 0).setDepth(RhythmDepth.JUDGEMENT_EFFECTS);
    this.createTouchControls();
    this.createHud();
    this.bindLaneInput();
    this.bindTouchInput();
    const approachSeconds = SPAWN_AHEAD_SECONDS;
    this.notes = new NoteManager(
      this,
      this.engine.notes,
      this.noteRoot,
      approachSeconds,
      approachSeconds,
    );
    this.notes.setCenterX(this.centerX);
    this.createStartOverlay();
    // Track preparation is complete and the start gate is usable: only now
    // may Level 4 use idle bandwidth.
    prefetchNextLevel('Rhythm', {
      profile: getRuntimeAssetQualityProfile(this.game, this.scale),
    });
    new OrientationController(this, {
      onPause: () => { this.clock.pause(); this.boothAnimation.pause(); void this.audio.pause(); },
      onResume: () => {
        if (this.playing) this.boothAnimation.resume();
        void this.audio.resume().then((resumed) => { if (resumed) this.clock.resume(); });
      },
      onLayout: (viewport) => this.applyResponsiveLayout(viewport),
    });
  }

  private createClub(): void {
    const referenceCenterX = DESIGN_WIDTH / 2;
    this.clubRoot = this.add.container(this.centerX, 0).setDepth(RhythmDepth.CLUB_BACKGROUND);
    this.stageFlash = this.add.rectangle(0, 230, 900, 350, 0x8f2677, 1).setAlpha(0);
    this.clubRoot.add(this.stageFlash);
    this.clubRoot.add(this.add.rectangle(0, 190, 420, 100, 0x21112c));
    this.clubRoot.add(this.add.rectangle(0, 215, 230, 64, 0x0b0811).setStrokeStyle(4, 0xff477e));
    for (const referenceX of [145, 1135]) {
      const x = referenceX - referenceCenterX;
      this.clubRoot.add(this.add.rectangle(x, 285, 125, 340, 0x0b0711).setStrokeStyle(4, 0x24192c));
      for (const y of [205, 320]) this.clubRoot.add(this.add.circle(x, y, 42, 0x120c19).setStrokeStyle(3, 0x2c2034, 0.55));
    }
    this.clubBeams = this.add.graphics();
    this.clubBeams.fillStyle(0x9d6cff, 0.09).fillTriangle(360 - referenceCenterX, 100, 530 - referenceCenterX, 590, 650 - referenceCenterX, 590);
    this.clubBeams.fillStyle(0xff477e, 0.08).fillTriangle(920 - referenceCenterX, 100, 630 - referenceCenterX, 590, 780 - referenceCenterX, 590);
    this.clubRoot.add(this.clubBeams);
    this.clubMissOverlay = this.add.rectangle(0, 310, 980, 480, 0xff334f, 1).setAlpha(0);
    this.clubRoot.add(this.clubMissOverlay);
    this.crowdMembers = [];
    for (let index = 0; index < 16; index += 1) {
      const crowd = this.add.ellipse(35 + index * 82 - referenceCenterX, 690, 72, 95 + (index % 3) * 18, 0x130b1c);
      this.clubRoot.add(crowd);
      this.crowdMembers.push(crowd);
      this.tweens.add({ targets: crowd, y: `-=${7 + (index % 3) * 3}`, yoyo: true, repeat: -1, duration: 420 + index * 17 });
    }
  }

  private createDecks(): void {
    const layout = getRhythmAssetLayout(this.centerX);
    this.deckRoot = this.add.container(this.centerX, 0).setDepth(RhythmDepth.HIGHWAY + 25);
    this.leftDeck = this.add.image(
      layout.leftDeckX - this.centerX,
      layout.deckY,
      RHYTHM_DECK_TEXTURE_KEY,
    ).setOrigin(0.5, 0).setDisplaySize(RHYTHM_DECK_WIDTH, RHYTHM_DECK_HEIGHT);
    this.rightDeck = this.add.image(
      layout.rightDeckX - this.centerX,
      layout.deckY,
      RHYTHM_DECK_TEXTURE_KEY,
    ).setOrigin(0.5, 0).setDisplaySize(RHYTHM_DECK_WIDTH, RHYTHM_DECK_HEIGHT).setFlipX(true);
    this.deckRoot.add([this.leftDeck, this.rightDeck]);
  }

  private drawHighwayForeground(): void {
    const hit = getLaneBoundaries(1, this.centerX);
    this.highwayForeground.clear();
    this.highwayForeground.lineStyle(18, 0xffdf57, 0.22).lineBetween(hit[0], HIT_LINE_Y, hit[4], HIT_LINE_Y);
    this.highwayForeground.lineStyle(7, 0xffffff, 1).lineBetween(hit[0], HIT_LINE_Y, hit[4], HIT_LINE_Y);
  }

  private createTouchControls(): void {
    for (let lane = 0; lane < 4; lane += 1) {
      const geometry = getJudgementPadGeometry(lane as Lane, this.centerX);
      const symbol = ['●', '■', '▲', '◆'][lane];
      const label = this.add.text(geometry.centerX, geometry.centerY, `${symbol}\n${LANE_LABELS[lane]}`, { fontFamily: 'Space Mono', fontSize: '34px', fontStyle: 'bold', color: '#ffffff', stroke: '#10091d', strokeThickness: 6, align: 'center', lineSpacing: 2 }).setOrigin(0.5).setDepth(RhythmDepth.UI);
      this.touchLabels.push(label);
    }
    this.hitHere = this.add.text(this.centerX, HIT_LINE_Y - 24, 'HIT HERE', { fontFamily: 'Space Mono', fontSize: '16px', fontStyle: 'bold', color: '#ffffff', backgroundColor: '#301536', padding: { x: 9, y: 4 } }).setOrigin(0.5, 1).setDepth(RhythmDepth.JUDGEMENT_EFFECTS);
    if (this.game.device.input.touch) this.touchInstruction = this.add.text(this.centerX, PAD_BOTTOM_Y + 20, 'TAP THE LANE WHEN THE NOTE REACHES THE LINE', { fontFamily: 'Space Mono', fontSize: '13px', color: '#ffffff' }).setOrigin(0.5, 1).setDepth(RhythmDepth.UI);
    this.touchDebug = this.add.graphics().setDepth(RhythmDepth.UI + 1);
    this.touchDebugText = this.add.text(18, 130, '', { fontFamily: 'Space Mono', fontSize: '15px', color: '#56ffff', backgroundColor: '#090611cc', padding: { x: 8, y: 6 } }).setDepth(RhythmDepth.UI + 1).setVisible(false);
  }

  private createHud(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Space Mono', fontSize: '17px', color: '#fff', stroke: '#090611', strokeThickness: 5 };
    this.add.text(22, 18, this.chart.title, { ...style, color: '#ffdd57' }).setDepth(RhythmDepth.UI);
    this.add.text(22, 48, `BERLIN  ${this.berlinScore}`, style).setDepth(RhythmDepth.UI);
    this.scoreText = this.add.text(22, 76, '', style).setDepth(RhythmDepth.UI);
    this.comboText = this.add.text(this.centerX, 38, '', { ...style, align: 'center' }).setOrigin(0.5).setDepth(RhythmDepth.UI);
    this.progressTrack = this.add.rectangle(this.centerX, 12, 500, 7, 0x2a1836).setDepth(RhythmDepth.UI);
    this.progressBar = this.add.rectangle(this.centerX - 250, 12, 0, 7, 0xffdd57).setOrigin(0, 0.5).setDepth(RhythmDepth.UI);
    this.judgementText = this.add.text(this.centerX, HIT_LINE_Y - 82, '', { fontFamily: 'Archivo Black', fontSize: '46px', color: '#fff', stroke: '#541864', strokeThickness: 7 }).setOrigin(0.5).setAlpha(0).setDepth(RhythmDepth.UI);
    this.rhythmDebugText = this.add.text(this.cameras.main.width - 18, 108, '', {
      fontFamily: 'Space Mono',
      fontSize: '14px',
      color: '#56ffff',
      backgroundColor: '#090611dd',
      align: 'right',
      padding: { x: 9, y: 7 },
    }).setOrigin(1, 0).setDepth(RhythmDepth.UI + 2).setVisible(false);
    this.updateHud();
  }

  private createStartOverlay(): void {
    const background = this.add.rectangle(0, this.cameras.main.height / 2, 760, 280, 0x090611, 0.96).setStrokeStyle(5, 0xff477e).setInteractive();
    const text = this.add.text(0, this.cameras.main.height / 2, 'GET ON THE DECKS\n\nPRESS SPACE\nOR TAP TO START THE SET', { fontFamily: 'Archivo Black', fontSize: '34px', color: '#ffdd57', align: 'center', lineSpacing: 8 }).setOrigin(0.5);
    const overlay = this.add.container(this.centerX, 0, [background, text]).setDepth(RhythmDepth.UI);
    this.activeOverlay = overlay;
    let start = (): void => undefined;
    start = createRhythmStartHandler({
      unlockAudio: async () => {
        return this.audio.unlock();
      },
      cleanupListeners: () => {
        this.input.off('pointerdown', start);
        this.input.keyboard?.off('keydown-SPACE', start);
      },
      startTutorial: () => {
        this.starting = true;
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

  private runCountdown(overlay: Phaser.GameObjects.Container, background: Phaser.GameObjects.Rectangle, text: Phaser.GameObjects.Text): void {
    background.setAlpha(0.84);
    ["YOU'RE ON.", '3', '2', '1', 'GO'].forEach((step, index) => this.time.delayedCall(index * 600, () => text.setText(step)));
    this.time.delayedCall(3000, () => {
      overlay.destroy(true);
      if (this.activeOverlay === overlay) this.activeOverlay = undefined;
      if (!this.beginGameplay()) this.showAudioStartFallback();
    });
  }

  private beginGameplay(): boolean {
    if (!this.audio.start(this.playbackWindow.audioStartSeconds, this.playbackWindow.endSeconds, this.playbackWindow.fadeOutSeconds)) return false;
    this.activateGameplay();
    return true;
  }

  private async beginGameplayFromGesture(): Promise<boolean> {
    const started = await this.audio.startFromGesture(
      this.playbackWindow.audioStartSeconds,
      this.playbackWindow.endSeconds,
      this.playbackWindow.fadeOutSeconds,
    );
    if (!started || !this.scene.isActive()) return false;
    this.activateGameplay();
    return true;
  }

  private activateGameplay(): void {
    this.clock.start();
    this.boothAnimation.startGameplay();
    this.playing = true;
  }

  private showAudioStartFallback(): void {
    const background = this.add.rectangle(0, this.cameras.main.height / 2, 700, 240, 0x090611, 0.96).setStrokeStyle(5, 0xff477e).setInteractive();
    const text = this.add.text(0, this.cameras.main.height / 2, 'AUDIO IS PAUSED\n\nTAP TO START SET', { fontFamily: 'Archivo Black', fontSize: '38px', color: '#ffdd57', align: 'center' }).setOrigin(0.5);
    const overlay = this.add.container(this.centerX, 0, [background, text]).setDepth(RhythmDepth.UI);
    this.activeOverlay = overlay;
    let retrying = false;
    const cleanup = (): void => {
      background.off('pointerdown', retry);
      this.input.off('pointerdown', retry);
      this.input.keyboard?.off('keydown-SPACE', retry);
    };
    const retry = (): void => {
      if (retrying) return;
      retrying = true;
      text.setText('STARTING AUDIO...');
      void this.beginGameplayFromGesture().then((started) => {
        retrying = false;
        if (!started) {
          text.setText('AUDIO COULD NOT START\n\nTAP TO RETRY');
          return;
        }
        cleanup();
        overlay.destroy(true);
        if (this.activeOverlay === overlay) this.activeOverlay = undefined;
      }).catch((error: unknown) => {
        retrying = false;
        text.setText('AUDIO COULD NOT START\n\nTAP TO RETRY');
        if (import.meta.env.DEV) console.warn('[RhythmScene] audio retry failed', error);
      });
    };
    background.on('pointerdown', retry);
    this.input.on('pointerdown', retry);
    this.input.keyboard?.on('keydown-SPACE', retry);
  }

  private startTutorial(): void {
    this.tutorial = new TutorialProgress();
    this.showTutorialNote();
  }

  private showTutorialNote(): void {
    const lane = this.tutorial?.currentLane;
    if (lane === null || lane === undefined) {
      this.hitHere.destroy();
      this.scoreState = initialScoreState(this.chart.notes.length);
      this.inputGuard.reset();
      this.antiMash.reset();
      this.updateHud();
      const background = this.add.rectangle(0, this.cameras.main.height / 2, 500, 220, 0x090611, 0.9);
      const text = this.add.text(0, this.cameras.main.height / 2, 'READY', { fontFamily: 'Archivo Black', fontSize: '58px', color: '#ffdd57' }).setOrigin(0.5);
      const overlay = this.add.container(this.centerX, 0, [background, text]).setDepth(RhythmDepth.UI);
      this.activeOverlay = overlay;
      this.runCountdown(overlay, background, text);
      return;
    }
    this.tutorialReady = false;
    const colorNames = ['ORANGE', 'PINK', 'PURPLE', 'YELLOW'];
    this.tutorialPrompt?.destroy();
    this.tutorialPrompt = this.add.text(this.centerX, 300, `TAP ${colorNames[lane]}`, { fontFamily: 'Archivo Black', fontSize: '38px', color: '#ffffff', stroke: '#34103e', strokeThickness: 8 }).setOrigin(0.5).setDepth(RhythmDepth.UI);
    const shape = lane === 0 ? this.add.circle(0, 0, 32, LANE_COLORS[lane]) : lane === 1 ? this.add.rectangle(0, 0, 62, 62, LANE_COLORS[lane]) : lane === 2 ? this.add.triangle(0, 0, 0, 62, 31, 0, 62, 62, LANE_COLORS[lane]) : this.add.rectangle(0, 0, 50, 50, LANE_COLORS[lane]).setAngle(45);
    const symbol = this.add.text(0, 0, ['●', '■', '▲', '◆'][lane], { fontFamily: 'Arial', fontSize: '28px', color: '#130a1d' }).setOrigin(0.5);
    this.tutorialNote = this.add.container([-0.75, -0.25, 0.25, 0.75][lane] * HORIZON_HALF_WIDTH, HORIZON_Y, [shape, symbol]).setScale(0.2).setDepth(RhythmDepth.NOTES);
    this.tutorialRoot.add(this.tutorialNote);
    this.tweens.add({ targets: this.tutorialNote, x: [-0.75, -0.25, 0.25, 0.75][lane] * HIT_LINE_HALF_WIDTH, y: HIT_LINE_Y, scale: 1.2, duration: 1500, ease: 'Cubic.in', onComplete: () => { this.tutorialReady = true; } });
  }

  private bindLaneInput(): void {
    const bindings: Array<[string, Lane]> = [['D', 0], ['F', 1], ['J', 2], ['K', 3], ['LEFT', 0], ['DOWN', 1], ['UP', 2], ['RIGHT', 3]];
    for (const [key, lane] of bindings) {
      this.input.keyboard?.on(`keydown-${key}`, (event: KeyboardEvent) => {
        event.preventDefault();
        if (!event.repeat) this.pressLane(lane);
      });
    }
    if (import.meta.env.DEV) this.input.keyboard?.on('keydown-T', () => { this.touchDebugVisible = !this.touchDebugVisible; this.drawTouchDebug(); });
    if (import.meta.env.DEV) this.input.keyboard?.on('keydown-R', () => {
      this.rhythmDebugVisible = !this.rhythmDebugVisible;
      this.rhythmDebugText.setVisible(this.rhythmDebugVisible);
      this.updateRhythmDebug();
    });
  }

  private bindTouchInput(): void {
    if (!this.touchPointersAdded) {
      this.input.addPointer(3);
      this.touchPointersAdded = true;
    }
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.starting && !this.tutorial && !this.playing) return;
      const area = getTouchArea(this.centerX);
      const lane = mapLogicalPointerToLane(pointer.x, pointer.y, area);
      this.debugPointer = { x: pointer.x, y: pointer.y, lane };
      this.drawTouchDebug();
      if (lane !== null && this.inputGuard.beginPointer(pointer.id, lane, this.time.now)) this.pressLane(lane, true);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.inputGuard.endPointer(pointer.id));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const area = getTouchArea(this.centerX);
      this.debugPointer = { x: pointer.x, y: pointer.y, lane: mapLogicalPointerToLane(pointer.x, pointer.y, area) };
      this.drawTouchDebug();
    });
  }

  private pressLane(lane: Lane, inputGuarded = false): void {
    if (!inputGuarded && !this.inputGuard.allowLane(lane, this.time.now)) return;
    this.showPressFeedback(lane);
    if (this.tutorial && !this.tutorial.complete) {
      if (this.tutorialReady && this.tutorial.hit(lane)) {
        this.tutorialNote?.destroy(); this.tutorialPrompt?.destroy();
        this.showTutorialNote();
      }
      return;
    }
    if (!this.playing || this.finished) return;
    const effectiveSongTime = this.clock.currentTimeSeconds + this.inputOffsetMs / 1000;
    const result = this.engine.hitLane(lane, effectiveSongTime);
    if (!result) { this.registerBadTap(lane); return; }
    this.lastTimingDifferenceMs = result.differenceMs;
    this.notes.resolve(result.note.id);
    this.registerJudgement(result.judgement, lane, !this.antiMash.isLocked(this.clock.currentTimeMs));
  }

  private registerBadTap(lane: Lane): void {
    const now = this.clock.currentTimeMs;
    this.scoreState = applyBadTap(this.scoreState);
    this.updateHud();
    this.highway.flashLane(lane, 0xff334f, false);
    this.judgementText.setText('BAD TAP -40').setFontSize(25).setY(HIT_LINE_Y - 50).setColor('#ff334f').setAlpha(1).setScale(1);
    this.tweens.killTweensOf(this.judgementText);
    this.tweens.add({ targets: this.judgementText, alpha: 0, duration: 300 });
    if (this.antiMash.recordBadTap(now)) {
      this.judgementText.setText('STOP MASHING').setFontSize(30).setColor('#ff334f').setAlpha(1);
      this.tweens.add({ targets: this.judgementText, alpha: 0, delay: 550, duration: 250 });
    }
  }

  private showPressFeedback(lane: Lane): void {
    this.highway.flashLane(lane, LANE_COLORS[lane], false);
    this.boothAnimation.reactLane(lane);
    const horizon = getLaneBoundaries(0, 0);
    const hit = getLaneBoundaries(1, 0);
    const flash = this.add.graphics().fillStyle(LANE_COLORS[lane], 0.22).fillPoints([
      new Phaser.Geom.Point(horizon[lane], HORIZON_Y),
      new Phaser.Geom.Point(horizon[lane + 1], HORIZON_Y),
      new Phaser.Geom.Point(hit[lane + 1], HIT_LINE_Y),
      new Phaser.Geom.Point(hit[lane], HIT_LINE_Y),
    ], true);
    const rippleX = (hit[lane] + hit[lane + 1]) / 2;
    const ripple = this.add.circle(rippleX, HIT_LINE_Y, 18, LANE_COLORS[lane], 0).setStrokeStyle(5, LANE_COLORS[lane], 0.9).setDepth(RhythmDepth.JUDGEMENT_EFFECTS);
    this.feedbackRoot.add([flash, ripple]);
    this.tweens.add({ targets: [flash, ripple], alpha: 0, duration: 180, onComplete: () => { flash.destroy(); ripple.destroy(); } });
    this.tweens.add({ targets: ripple, scale: 2.2, duration: 180 });
  }

  private registerJudgement(judgement: Judgement, lane?: Lane, scoringEnabled = true): void {
    const awardedPoints = scoringEnabled ? getAwardedPoints(this.scoreState, judgement) : 0;
    this.scoreState = applyJudgement(this.scoreState, judgement, scoringEnabled);
    if (lane !== undefined) this.highway.flashLane(lane, judgement === 'PERFECT' ? 0xffffff : LANE_COLORS[lane], judgement === 'PERFECT');
    if (judgement === 'PERFECT' && lane !== undefined) {
      this.boothAnimation.flashPerfect(lane);
      this.mixer.flashPerfect();
      this.flashClubPerfect();
    }
    if (judgement === 'MISS') {
      this.boothAnimation.flashMiss();
      this.flashClubMiss();
    }
    const feedback = judgement === 'MISS' ? 'MISS' : `${judgement}\n+${awardedPoints}`;
    this.judgementText.setText(feedback).setFontSize(judgement === 'MISS' ? 28 : judgement === 'PERFECT' ? 46 : judgement === 'GOOD' ? 40 : 34).setY(HIT_LINE_Y - (judgement === 'MISS' ? 52 : 92)).setColor(judgement === 'PERFECT' ? '#ffffff' : judgement === 'GOOD' ? '#ffdd57' : judgement === 'OK' ? '#ff8a3d' : '#ff3f5e').setAlpha(1).setScale(judgement === 'PERFECT' ? 1.2 : 1);
    this.tweens.killTweensOf(this.judgementText);
    this.tweens.add({ targets: this.judgementText, alpha: 0, scale: 1, duration: 330 });
    this.updateHud();
  }

  private updateHud(): void {
    this.scoreText.setText(`RHYTHM  ${this.scoreState.score}`);
    this.comboText.setText(`${this.scoreState.combo} COMBO   x${getMultiplier(this.scoreState.combo)}`);
    this.boothAnimation?.setCombo(this.scoreState.combo);
    this.mixer?.setCombo(this.scoreState.combo);
  }

  private applyResponsiveLayout(viewport: ViewportInfo): void {
    const centerX = this.centerX;
    this.clubRoot.setX(centerX);
    this.deckRoot.setX(centerX);
    this.boothAnimation.setCenterX(centerX);
    this.mixer.setCenterX(centerX);
    this.highway.refreshGeometry(centerX);
    this.drawHighwayForeground();
    this.notes.setCenterX(centerX);
    this.tutorialRoot.setX(centerX);
    this.feedbackRoot.setX(centerX);
    this.hitHere?.setX(centerX);
    this.touchInstruction?.setX(centerX);
    this.progressTrack.setX(centerX);
    this.progressBar.setX(centerX - 250);
    this.activeOverlay?.setX(centerX);
    this.tutorialPrompt?.setX(centerX);
    this.scoreText.setScale(viewport.hudScale);
    this.comboText.setPosition(centerX, this.comboText.y).setScale(viewport.hudScale);
    this.judgementText.setPosition(centerX, this.judgementText.y).setScale(viewport.hudScale);
    this.rhythmDebugText.setX(this.cameras.main.width - 18);
    const controlScale = viewport.compactLandscape ? 0.82 : 1;
    for (let lane = 0; lane < this.touchLabels.length; lane += 1) {
      const geometry = getJudgementPadGeometry(lane as Lane, centerX);
      this.touchLabels[lane].setPosition(geometry.centerX, geometry.centerY).setScale(controlScale);
    }
    this.drawTouchDebug();
  }

  private drawTouchDebug(): void {
    this.touchDebug.clear();
    this.touchDebugText.setVisible(this.touchDebugVisible);
    if (!this.touchDebugVisible) return;
    const area = getTouchArea(this.centerX);
    this.touchDebug.lineStyle(3, 0x56ffff, 0.9);
    for (let lane = 0; lane < 4; lane += 1) this.touchDebug.strokePoints([
      new Phaser.Geom.Point(area.boundaries[lane], area.top),
      new Phaser.Geom.Point(area.boundaries[lane + 1], area.top),
      new Phaser.Geom.Point(area.boundaries[lane + 1], area.bottom),
      new Phaser.Geom.Point(area.boundaries[lane], area.bottom),
    ], true);
    const horizon = getLaneBoundaries(0, this.centerX);
    const hit = getLaneBoundaries(1, this.centerX);
    this.touchDebug.lineStyle(2, 0xff55ff, 0.95);
    for (let boundary = 0; boundary < 5; boundary += 1) this.touchDebug.lineBetween(horizon[boundary], HORIZON_Y, hit[boundary], HIT_LINE_Y);
    this.touchDebug.lineStyle(2, 0x55ff88, 0.95);
    for (let lane = 0; lane < 4; lane += 1) {
      const centerTop = (horizon[lane] + horizon[lane + 1]) / 2;
      const centerBottom = (hit[lane] + hit[lane + 1]) / 2;
      this.touchDebug.lineBetween(centerTop, HORIZON_Y, centerBottom, area.bottom);
      const pad = getJudgementPadGeometry(lane as Lane, this.centerX);
      const points = [] as Phaser.Geom.Point[];
      for (let index = 0; index < pad.points.length; index += 2) points.push(new Phaser.Geom.Point(pad.centerX + pad.points[index], pad.centerY + pad.points[index + 1]));
      this.touchDebug.strokePoints(points, true);
    }
    this.touchDebugText.setText(`POINTER  ${Math.round(this.debugPointer.x)}, ${Math.round(this.debugPointer.y)}\nLANE     ${this.debugPointer.lane ?? '—'}`);
  }

  private updateRhythmDebug(): void {
    if (!this.rhythmDebugVisible || !this.engine || !this.clock) return;
    const nextNote = this.engine.nextPendingNote;
    this.rhythmDebugText.setText([
      `SONG        ${this.clock.currentTimeSeconds.toFixed(3)} s`,
      `NEXT NOTE   ${nextNote ? `${nextNote.time.toFixed(3)} s` : 'none'}`,
      `DIFFERENCE  ${this.lastTimingDifferenceMs === null ? 'n/a' : `${this.lastTimingDifferenceMs.toFixed(1)} ms`}`,
      `ACTIVE      ${this.notes.activeCount}`,
      `FPS         ${this.game.loop.actualFps.toFixed(1)}`,
      `OFFSET      ${this.inputOffsetMs.toFixed(1)} ms`,
      `NOTES       ${this.engine.judgedCount}/${this.chart.notes.length}`,
    ]);
  }

  private endLevel(): void {
    if (this.finished) return;
    this.finished = true; this.playing = false; this.clock.stop(); this.audio.stop();
    this.boothAnimation.stop();
    const completeText = this.add.text(0, 310, 'SET COMPLETE', { fontFamily: 'Archivo Black', fontSize: '58px', color: '#ffdd57', stroke: '#451452', strokeThickness: 9 }).setOrigin(0.5);
    const overlay = this.add.container(this.centerX, 0, [completeText]).setDepth(RhythmDepth.UI);
    this.activeOverlay = overlay;
    this.time.delayedCall(1500, () => {
      overlay.destroy(true);
      if (this.activeOverlay === overlay) this.activeOverlay = undefined;
      void this.openRhythmComplete();
    });
  }

  private openRhythmComplete(): void {
    const rhythmResult = {
      ...this.scoreState,
      berlinScore: this.berlinScore,
      accuracy: calculateAccuracy(this.scoreState),
      success: true,
    };
    const stageSnapshot = this.clubStageSnapshot;
    if (stageSnapshot) {
      this.scene.start('LevelCompleteScene', {
        score: this.scoreState.score,
        maxScore: RHYTHM_SCORE_CAP,
        retryScene: 'RhythmScene',
        retryData: {
          score: this.berlinScore,
          clubStoryCast: this.clubStoryCast,
          clubStageSnapshot: stageSnapshot,
        },
        continueScene: 'DialogueScene',
        continueData: {
          script: buildPostRhythmDialogue(this.clubStoryCast.dj3Id),
          stageSnapshot,
          payload: { rhythmResult },
        },
      } satisfies LevelCompleteSceneData);
      return;
    }

    // A direct Rhythm development/replay entry has no prior Club frame.
    // Never substitute a Rhythm screenshot for the DJ room.
    this.scene.start('LevelCompleteScene', {
      score: this.scoreState.score,
      maxScore: RHYTHM_SCORE_CAP,
      retryScene: 'RhythmScene',
      retryData: { score: this.berlinScore, clubStoryCast: this.clubStoryCast },
      continueScene: 'Level4Scene',
      continueData: { rhythmResult },
    } satisfies LevelCompleteSceneData);
  }

  /** Raw Web Audio playback sits outside Phaser's update loop, so `scene.scene.pause()` alone can't stop it. */
  onGamePause(): void {
    void this.audio?.pause();
  }

  onGameResume(): void {
    void this.audio?.resume();
  }

  private cleanup(): void {
    this.playing = false;
    this.clock?.stop();
    this.unsubscribeSoundManager?.();
    this.unsubscribeSoundManager = undefined;
    this.audio?.destroy();
    this.notes?.destroy();
    this.boothAnimation?.destroy();
    this.mixer?.reset();
    this.tweens.killTweensOf([this.stageFlash, this.clubBeams, this.clubMissOverlay, ...this.crowdMembers]);
    this.time.removeAllEvents();
    this.input.removeAllListeners();
    this.input.keyboard?.removeAllListeners();
    this.tutorial = undefined;
    this.tutorialNote = undefined;
    this.tutorialPrompt = undefined;
    this.touchLabels.length = 0;
  }

  update(): void {
    if (!this.playing || this.finished) return;
    const time = this.clock.currentTimeSeconds;
    this.notes.update(time);
    const missed = this.engine.update(time);
    for (const note of missed) {
      this.notes.resolve(note.id);
      this.registerJudgement('MISS');
    }
    this.progressBar.displayWidth = 500 * getRhythmPlaybackProgress(time, this.playbackWindow.startSeconds, this.playbackWindow.endSeconds);
    const beatIndex = getBeatIndexAtTime(this.chart, time);
    if (beatIndex !== this.lastBeat) {
      this.lastBeat = beatIndex; this.highway.pulse();
      const strongBeat = beatIndex % 4 === 0;
      this.boothAnimation.pulseBeat(strongBeat);
      this.mixer.pulseBeat(beatIndex % 4 === 0);
      this.pulseClubBeat(strongBeat);
      this.cameras.main.zoomTo(beatIndex % 4 === 0 ? 1.008 : 1.003, 55, 'Sine.easeOut', true);
      this.time.delayedCall(70, () => this.cameras.main.zoomTo(1, 100));
    }
    this.updateRhythmDebug();
    this.completionGate.tryComplete(
      shouldCompleteTrack(this.audioEnded, this.engine.allNotesJudged),
      () => this.endLevel(),
    );
  }

  private pulseClubBeat(strong: boolean): void {
    const comboIntensity = Phaser.Math.Clamp(this.scoreState.combo / 40, 0, 1);
    this.tweens.killTweensOf([this.stageFlash, this.clubBeams]);
    this.stageFlash.setAlpha((strong ? 0.2 : 0.09) + comboIntensity * 0.1);
    this.clubBeams.setAlpha(0.58 + comboIntensity * 0.34);
    this.tweens.add({ targets: this.stageFlash, alpha: 0, duration: strong ? 230 : 170 });
    this.tweens.add({ targets: this.clubBeams, alpha: 0.18 + comboIntensity * 0.12, duration: strong ? 280 : 190 });
  }

  private flashClubPerfect(): void {
    const comboIntensity = Phaser.Math.Clamp(this.scoreState.combo / 40, 0, 1);
    this.tweens.killTweensOf([this.stageFlash, this.clubBeams]);
    this.stageFlash.setAlpha(0.34 + comboIntensity * 0.14);
    this.clubBeams.setAlpha(1);
    this.tweens.add({ targets: this.stageFlash, alpha: 0, duration: 280 });
    this.tweens.add({ targets: this.clubBeams, alpha: 0.2 + comboIntensity * 0.12, duration: 330 });
  }

  private flashClubMiss(): void {
    this.tweens.killTweensOf(this.clubMissOverlay);
    this.clubMissOverlay.setAlpha(0.16);
    this.tweens.add({ targets: this.clubMissOverlay, alpha: 0, duration: 190 });
  }
}
