import Phaser from 'phaser';
import { Depth } from '../constants';
import { getViewportInfo } from '../responsive/ResponsiveLayout';
import type { ViewportInfo } from '../responsive/ViewportInfo';
import type { BerlinProgress } from '../types/game';

const style: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Space Mono',
  fontSize: '22px',
  color: '#ffffff',
  stroke: '#10091d',
  strokeThickness: 6,
};

const hintStyle: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Space Mono',
  fontSize: '15px',
  color: '#ffffff',
  stroke: '#10091d',
  strokeThickness: 4,
};

/** Share of the viewport width given to the crouch zone; the rest jumps. */
const DUCK_ZONE_FRACTION = 0.35;
const HINT_ALPHA = 0.38;

/** Returning false lets the HUD know the scene ignored the action. */
export type TouchAction = () => boolean;
export type TouchHoldAction = (pressed: boolean) => boolean;

export class HudSystem {
  readonly score: Phaser.GameObjects.Text;
  readonly message: Phaser.GameObjects.Text;
  private readonly scene: Phaser.Scene;
  /** Last string pushed to the score label; setText re-renders its texture. */
  private scoreText = '';

  /** Touch-only: full-height screen zones, not created at all on desktop. */
  private duckZone?: Phaser.GameObjects.Zone;
  private jumpZone?: Phaser.GameObjects.Zone;
  private duckHint?: Phaser.GameObjects.Text;
  private jumpHint?: Phaser.GameObjects.Text;
  /**
   * Pointer that started the current crouch. Crouch ends only when this exact
   * pointer lifts, so a second finger tapping jump cannot cancel it and
   * dragging the crouching finger across the zone border changes nothing.
   */
  private crouchPointerId?: number;
  private readonly onPointerUp: (pointer: Phaser.Input.Pointer) => void;
  private readonly onGameOut: () => void;
  private readonly onBlur: () => void;

  constructor(
    scene: Phaser.Scene,
    private readonly onJump: TouchAction,
    private readonly onDuck: TouchHoldAction,
    uiLayer?: Phaser.GameObjects.Layer,
  ) {
    this.scene = scene;
    this.score = scene.add.text(0, 0, '', style).setOrigin(1, 0);
    this.message = scene.add
      .text(0, 0, '', { ...style, fontSize: '26px', align: 'center' })
      .setOrigin(0.5)
      .setAlpha(0);
    for (const object of [this.score, this.message]) {
      object.setScrollFactor(0).setDepth(Depth.UI);
    }
    uiLayer?.add([this.score, this.message]);

    this.onPointerUp = (pointer) => this.releaseCrouchFor(pointer.id);
    this.onGameOut = () => this.releaseTouchCrouch();
    this.onBlur = () => this.releaseTouchCrouch();

    if (scene.game.device.input.touch) this.createTouchZones(scene, uiLayer);

    // A pointer lifted anywhere ends the crouch it started, including outside
    // the zone or off the canvas entirely.
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp);
    scene.input.on(Phaser.Input.Events.GAME_OUT, this.onGameOut);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.onBlur);

    this.applyLayout(getViewportInfo(scene.scale));
  }

  private createTouchZones(scene: Phaser.Scene, uiLayer?: Phaser.GameObjects.Layer): void {
    // Below Depth.UI so the intro panel and its fullscreen button still win
    // the pointer; Phaser's topOnly input hands the event to the highest one.
    const zoneDepth = Depth.UI - 5;

    this.duckZone = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(zoneDepth);
    this.jumpZone = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(zoneDepth);
    this.duckZone.setInteractive();
    this.jumpZone.setInteractive();

    this.duckHint = scene.add
      .text(0, 0, 'HOLD · DUCK', hintStyle)
      .setOrigin(0.5, 1)
      .setAlpha(HINT_ALPHA)
      .setScrollFactor(0)
      .setDepth(zoneDepth + 1);
    this.jumpHint = scene.add
      .text(0, 0, 'TAP · JUMP', hintStyle)
      .setOrigin(0.5, 1)
      .setAlpha(HINT_ALPHA)
      .setScrollFactor(0)
      .setDepth(zoneDepth + 1);

    // The action is decided here, by which zone the pointer went down in.
    this.jumpZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event?.preventDefault();
      if (this.onJump()) this.fadeHint(this.jumpHint);
    });

    this.duckZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event?.preventDefault();
      if (this.crouchPointerId !== undefined) return;
      if (!this.onDuck(true)) return;
      this.crouchPointerId = pointer.id;
      this.fadeHint(this.duckHint);
    });

    uiLayer?.add([this.duckZone, this.jumpZone, this.duckHint, this.jumpHint]);
  }

  private releaseCrouchFor(pointerId: number): void {
    if (this.crouchPointerId !== pointerId) return;
    this.releaseTouchCrouch();
  }

  /** Drops any held crouch. Safe to call at any time, from anywhere. */
  releaseTouchCrouch(): void {
    if (this.crouchPointerId === undefined) return;
    this.crouchPointerId = undefined;
    this.onDuck(false);
  }

  private fadeHint(hint?: Phaser.GameObjects.Text): void {
    if (!hint || hint.alpha === 0) return;
    this.scene.tweens.add({ targets: hint, alpha: 0, duration: 400 });
  }

  update(progress: BerlinProgress): void {
    const next = `SCORE  ${progress.score}\nUSB  ${progress.hasUsb ? '✓' : '—'}`;
    if (next === this.scoreText) return;
    this.scoreText = next;
    this.score.setText(next);
  }

  flash(text: string, duration = 1100): void {
    this.message.setText(text).setAlpha(1);
    this.message.scene.tweens.killTweensOf(this.message);
    this.message.scene.tweens.add({
      targets: this.message,
      alpha: 0,
      delay: duration,
      duration: 250,
    });
  }

  applyLayout(viewport: ViewportInfo): void {
    // Camera width follows the viewport aspect ratio under Scale.EXPAND, so
    // HUD elements anchor to the camera's own visible bounds rather than the
    // fixed design constants.
    const camera = this.scene.cameras.main;
    const width = camera.width;
    const height = camera.height;
    const margin = viewport.safeMargin;
    this.score.setPosition(width - margin, margin).setScale(viewport.hudScale);
    this.message.setPosition(width / 2, margin + 66).setScale(viewport.hudScale);

    // Zones span the full height and split the width; resizing them here keeps
    // them covering the viewport exactly after a rotation or resize.
    const duckWidth = Math.round(width * DUCK_ZONE_FRACTION);
    this.duckZone?.setPosition(0, 0).setSize(duckWidth, height);
    this.jumpZone?.setPosition(duckWidth, 0).setSize(width - duckWidth, height);

    const hintY = height - margin;
    this.duckHint?.setPosition(duckWidth / 2, hintY).setScale(viewport.hudScale);
    this.jumpHint?.setPosition(duckWidth + (width - duckWidth) / 2, hintY).setScale(viewport.hudScale);
  }

  /** Releases every listener this system registered on the scene and game. */
  destroy(): void {
    this.releaseTouchCrouch();
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp);
    this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.onGameOut);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.onBlur);
  }
}
