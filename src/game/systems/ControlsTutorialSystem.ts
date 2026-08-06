import Phaser from 'phaser';
import { Depth, RUN_SPEED } from '../constants';
import {
  createTutorialState,
  duckTriggerX,
  planCueDelays,
  registerDoubleJump,
  registerJump,
  resetTutorialState,
  shouldShowJumpCue,
  shouldStartDuckPrompt,
  tickTutorial,
  updateDuckHold,
  type TutorialState,
} from '../level/berlin/controlsTutorial';
import type { ViewportInfo } from '../responsive/ViewportInfo';
import type { BerlinEntity } from '../level/berlin/types';

/** Fraction of the width the crouch zone occupies; mirrors HudSystem. */
const DUCK_ZONE_FRACTION = 0.35;
const TINT_ALPHA = 0.22;
const PULSE_MS = 620;

interface TutorialCallbacks {
  /** Freezes and unfreezes the player's forward motion for the duck prompt. */
  setPlayerFrozen: (frozen: boolean) => void;
  /** Suspends the player mid-air while the double-jump cue is up. */
  setAirHold: (hold: boolean) => void;
  /** Fired once, when both stages are done. */
  onComplete: () => void;
}

/** Distance the player is stopped short of the obstacle they are learning. */
const DUCK_TRIGGER_SAFE = -100;

/**
 * Draws the two-step controls tutorial and drives the pure state machine in
 * controlsTutorial.ts. Everything is Phaser graphics and text at
 * scrollFactor(0), sized from the camera so a rotation re-lays it out, and
 * kept below Depth.UI so the intro panel and fullscreen button still win input.
 */
export class ControlsTutorialSystem {
  readonly state: TutorialState;
  private readonly triggerX?: number;
  private readonly root: Phaser.GameObjects.Container;
  private readonly tint: Phaser.GameObjects.Rectangle;
  private readonly border: Phaser.GameObjects.Rectangle;
  private readonly arrow: Phaser.GameObjects.Text;
  private readonly word: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private pulse?: Phaser.Tweens.Tween;
  private arrowDrift?: Phaser.Tweens.Tween;
  private viewport?: ViewportInfo;
  private readonly touch: boolean;
  private disposed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    entities: readonly BerlinEntity[],
    private readonly callbacks: TutorialCallbacks,
    uiLayer?: Phaser.GameObjects.Layer,
  ) {
    this.touch = scene.game.device.input.touch;
    // Always guided: the tutorial plays every time this level starts.
    this.state = createTutorialState(true);
    this.triggerX = duckTriggerX(entities);

    const depth = Depth.UI - 3;
    this.tint = scene.add.rectangle(0, 0, 1, 1, 0x53ffe0, TINT_ALPHA).setOrigin(0, 0);
    this.border = scene.add
      .rectangle(0, 0, 1, 1)
      .setOrigin(0, 0)
      .setFillStyle(0x000000, 0)
      .setStrokeStyle(4, 0xffe36d, 0.9);
    this.arrow = scene.add
      .text(0, 0, '', { fontFamily: 'Archivo Black', fontSize: '72px', color: '#ffe36d' })
      .setOrigin(0.5);
    this.word = scene.add
      .text(0, 0, '', { fontFamily: 'Archivo Black', fontSize: '30px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5);
    this.banner = scene.add
      .text(0, 0, '', {
        fontFamily: 'Archivo Black',
        fontSize: '34px',
        color: '#120b1d',
        backgroundColor: '#ffe36d',
        padding: { x: 18, y: 10 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.root = scene.add
      .container(0, 0, [this.tint, this.border, this.arrow, this.word])
      .setScrollFactor(0)
      .setDepth(depth)
      .setVisible(false);
    this.banner.setScrollFactor(0).setDepth(depth + 1);
    uiLayer?.add([this.root, this.banner]);
  }

  get guided(): boolean {
    return this.state.guided;
  }

  /** True while the tutorial is still holding the run timer back. */
  get gatesTimer(): boolean {
    return this.state.stage !== 'complete';
  }

  get penaltiesSuspended(): boolean {
    return this.state.duckPromptActive;
  }

  /**
   * Plans the cue spacing from where the run actually begins, so a level with
   * an early duck obstacle compresses the delays instead of stacking the cues.
   */
  planFromStart(startX: number): void {
    const safeX = this.triggerX === undefined ? undefined : this.triggerX + DUCK_TRIGGER_SAFE;
    const plan = planCueDelays(startX, safeX, RUN_SPEED);
    this.state.jumpDelayMs = plan.jumpDelayMs;
    this.state.duckDelayMs = plan.duckDelayMs;
  }

  /**
   * Called every frame while the run is active. Each cue freezes the player
   * until its action is performed. `crouching` must be the player's real
   * crouch state, not the raw input, so a prompt only clears when the
   * character is actually ducking.
   */
  update(
    playerX: number,
    crouching: boolean,
    jumpedThisFrame: boolean,
    jumpsThisAirtime: number,
    deltaMs: number,
  ): void {
    if (this.disposed || this.state.stage === 'complete') return;
    tickTutorial(this.state, deltaMs);

    // The cue waits out its delay of real running before appearing, so the
    // jump that starts the run cannot satisfy a lesson never shown.
    if (shouldShowJumpCue(this.state)) {
      this.state.jumpCueVisible = true;
      // Held still like the duck cue: the player has to perform the action to
      // move on, and cannot drift into obstacles while reading the prompt.
      this.callbacks.setPlayerFrozen(true);
      this.paint('jump', '↑', this.touch ? 'TAP RIGHT\nJUMP' : 'SPACE / ↑\nJUMP');
    }

    // First impulse: stay frozen and airborne, and immediately ask for the
    // second one. That is the only moment the lesson can be demonstrated.
    if (registerJump(this.state, jumpedThisFrame)) {
      // Hangs at the apex so the cue can be read and answered in the air.
      this.callbacks.setAirHold(true);
      this.paint('jump', '↑↑', this.touch ? 'TAP AGAIN\nDOUBLE JUMP' : 'PRESS AGAIN\nDOUBLE JUMP');
      return;
    }

    if (registerDoubleJump(this.state, jumpedThisFrame, jumpsThisAirtime)) {
      this.callbacks.setAirHold(false);
      this.callbacks.setPlayerFrozen(false);
      this.hidePrompt();
      this.showBanner('NICE!', 700);
      return;
    }

    if (shouldStartDuckPrompt(this.state, playerX, this.triggerX)) {
      this.state.duckPromptActive = true;
      this.callbacks.setPlayerFrozen(true);
      this.paint('duck', '↓', this.touch ? 'HOLD LEFT\nDUCK' : 'HOLD S / ↓\nDUCK');
    }

    if (this.state.duckPromptActive) {
      // Pressed-looking zone and a downward drift while the hold is building.
      this.tint.setFillStyle(0x53ffe0, crouching ? TINT_ALPHA * 2 : TINT_ALPHA);
      if (updateDuckHold(this.state, crouching, deltaMs)) {
        this.callbacks.setPlayerFrozen(false);
        this.hidePrompt();
        this.showBanner('GOT IT!', 700);
        this.finish();
      }
    }
  }

  private finish(): void {
    this.scene.time.delayedCall(700, () => {
      if (this.disposed) return;
      this.showBanner('JUMP + DUCK\nLET’S GO!', 1000);
      this.scene.time.delayedCall(1000, () => {
        if (this.disposed) return;
        this.callbacks.onComplete();
      });
    });
  }

  private paint(stage: 'jump' | 'duck', arrow: string, word: string): void {
    this.arrow.setText(arrow);
    this.word.setText(word);
    this.root.setVisible(true).setAlpha(1);
    this.layoutPrompt(stage);

    this.pulse?.remove();
    this.pulse = this.scene.tweens.add({
      targets: [this.border, this.tint],
      alpha: { from: 1, to: 0.45 },
      duration: PULSE_MS,
      yoyo: true,
      repeat: -1,
    });

    this.arrowDrift?.remove();
    const drift = stage === 'duck' ? 16 : -16;
    this.arrowDrift = this.scene.tweens.add({
      targets: this.arrow,
      y: `+=${drift}`,
      duration: PULSE_MS,
      yoyo: true,
      repeat: -1,
    });
  }

  private hidePrompt(): void {
    this.pulse?.remove();
    this.pulse = undefined;
    this.arrowDrift?.remove();
    this.arrowDrift = undefined;
    this.scene.tweens.add({
      targets: this.root,
      alpha: 0,
      duration: 260,
      onComplete: () => this.root.setVisible(false),
    });
  }

  private showBanner(text: string, holdMs: number): void {
    const camera = this.scene.cameras.main;
    this.banner.setText(text).setPosition(camera.width / 2, camera.height / 2).setVisible(true).setAlpha(1);
    this.scene.tweens.killTweensOf(this.banner);
    this.scene.tweens.add({
      targets: this.banner,
      alpha: 0,
      delay: holdMs,
      duration: 250,
      onComplete: () => this.banner.setVisible(false),
    });
  }

  /** Re-lays the overlay out after any viewport change. */
  applyLayout(viewport: ViewportInfo): void {
    this.viewport = viewport;
    if (!this.root.visible) return;
    this.layoutPrompt(this.state.stage === 'duck' ? 'duck' : 'jump');
  }

  private layoutPrompt(stage: 'jump' | 'duck'): void {
    const camera = this.scene.cameras.main;
    const width = camera.width;
    const height = camera.height;
    const margin = this.viewport?.safeMargin ?? 24;
    const duckWidth = Math.round(width * DUCK_ZONE_FRACTION);

    // Touch highlights the zone the finger must land in; a keyboard has no
    // zones, so the whole screen blinks instead of half of it.
    const zoneX = !this.touch ? 0 : stage === 'duck' ? 0 : duckWidth;
    const zoneWidth = !this.touch ? width : stage === 'duck' ? duckWidth : width - duckWidth;

    this.tint.setPosition(zoneX, 0).setSize(zoneWidth, height);
    this.tint.setFillStyle(0x53ffe0, this.touch ? TINT_ALPHA : TINT_ALPHA * 0.55);
    this.border
      .setPosition(zoneX + margin / 2, margin / 2)
      .setSize(zoneWidth - margin, height - margin);
    this.border.setStrokeStyle(4, 0xffe36d, 0.9);

    const centreX = zoneX + zoneWidth / 2;
    this.arrow.setPosition(centreX, height * 0.46);
    this.word.setPosition(centreX, height * 0.66);
  }

  /** Kills tweens and timers; safe to call more than once. */
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Never leave the player hanging if the scene goes away mid-cue.
    this.callbacks.setAirHold(false);
    resetTutorialState(this.state);
    this.pulse?.remove();
    this.arrowDrift?.remove();
    this.scene.tweens.killTweensOf(this.root);
    this.scene.tweens.killTweensOf(this.banner);
    this.root.destroy();
    this.banner.destroy();
  }
}

