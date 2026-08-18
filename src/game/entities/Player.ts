import Phaser from 'phaser';
import {
  Depth,
  GROUND_Y,
  HIT_INPUT_LOCK_MS,
  HIT_KNOCKBACK_DURATION,
  HIT_KNOCKBACK_SPEED,
  HIT_SLOW_DURATION,
  HIT_SLOW_SPEED,
  JUMP_VELOCITY,
  RUN_SPEED,
} from '../constants';
import { JUMP_BUFFER_MS, playerBodyFor, resolveJumpImpulse } from '../level/berlin/playerPhysics';
import type { PlayerAnimationState } from '../level/berlin/types';

export const ATMOS_RUN_FRAME_KEYS = [
  'atmos-run-1',
  'atmos-run-2',
  'atmos-run-3',
  'atmos-run-4',
  'atmos-run-5',
  'atmos-run-6',
] as const;
export const ATMOS_RUN_STATIC_FRAME_KEY = ATMOS_RUN_FRAME_KEYS[2];
const ATMOS_RUN_FRAME_DURATION_MS = 92;

export class Player extends Phaser.Physics.Arcade.Sprite {
  animationState: PlayerAnimationState = 'run';
  private crouched = false;
  private jumpBufferedUntil = -Infinity;
  private speed = RUN_SPEED;
  private hitInputsLockedUntil = -Infinity;
  private hitSlowUntil = -Infinity;
  private jumpCount = 0;
  /** Last time the feet were actually on something; drives coyote time. */
  private lastGroundedAt = -Infinity;
  /** Read by the controls tutorial: a real impulse landed on this frame. */
  didJumpThisFrame = false;
  /** Set while the duck tutorial holds the player still. */
  private frozen = false;
  /** Tutorial asked to suspend the player mid-air; engages at the apex. */
  private airHoldRequested = false;
  private airHolding = false;
  private visual: Phaser.GameObjects.Sprite;
  private currentVisualFrameKey?: string;

  constructor(scene: Phaser.Scene, x: number) {
    super(scene, x, GROUND_Y, 'dj');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(Depth.PLAYER).setCollideWorldBounds(true);
    this.applyBody(false);
    this.setScale(1);
    this.setAlpha(0);

    this.visual = scene.add.sprite(x, GROUND_Y, 'dj');
    this.visual.setOrigin(0.5, 1);
    this.visual.setDepth(Depth.PLAYER);
  }

  run(now: number): void {
    if (now >= this.hitSlowUntil && this.speed !== RUN_SPEED) this.speed = RUN_SPEED;
    this.setVelocityX(this.frozen ? 0 : this.speed);
    const body = this.body as Phaser.Physics.Arcade.Body;
    const grounded = body.blocked.down || body.touching.down;
    const jump = resolveJumpImpulse({
      now,
      grounded,
      crouched: this.crouched,
      lastGroundedAt: this.lastGroundedAt,
      bufferedUntil: this.jumpBufferedUntil,
      jumpCount: this.jumpCount,
    });
    this.lastGroundedAt = jump.lastGroundedAt;
    this.jumpBufferedUntil = jump.bufferedUntil;
    this.jumpCount = jump.jumpCount;
    const jumpedThisFrame = jump.jumped;
    // Both impulses are the same strength; there is no weaker second jump.
    if (jumpedThisFrame) this.setVelocityY(JUMP_VELOCITY);
    this.didJumpThisFrame = jumpedThisFrame;

    if (jumpedThisFrame && this.airHolding) {
      // Jumping out of the hold: gravity must be back before the pin below,
      // or the impulse would be cancelled on the frame it is applied.
      this.releaseAirHold();
    } else if (this.airHoldRequested && !this.airHolding && !grounded && body.velocity.y >= 0) {
      // Engage at the apex so the character rises normally and then hangs,
      // rather than stopping dead the instant it leaves the ground.
      this.airHolding = true;
      body.setAllowGravity(false);
      this.setVelocityY(0);
    }
    if (this.airHolding) {
      this.setVelocityX(0);
      this.setVelocityY(0);
    }
    this.animationState = this.crouched
      ? 'crouch'
      : grounded
        ? 'run'
        : jumpedThisFrame && this.jumpCount >= 2
          ? 'doubleJump'
          : body.velocity.y < 0
            ? 'jump'
            : 'fall';
    this.rotation = this.crouched ? 0 : Math.sin(now / 80) * 0.025;
    this.syncVisual(now);
  }

  private syncVisual(now: number): void {
    // this.y (origin 0.5,1) is always the sprite's own feet position and is
    // never affected by resizing the physics body, unlike body.y + body.height
    // which reads stale for one frame right after a crouch/stand toggle
    // (the body only resyncs on Phaser's next automatic preUpdate).
    this.visual.x = this.x;
    this.visual.y = this.y;
    const targetFrameKey = this.animationState === 'run'
      ? ATMOS_RUN_FRAME_KEYS[Math.floor(now / ATMOS_RUN_FRAME_DURATION_MS) % ATMOS_RUN_FRAME_KEYS.length]
      : ATMOS_RUN_STATIC_FRAME_KEY;
    if (targetFrameKey !== this.currentVisualFrameKey) {
      this.visual.setTexture(targetFrameKey);
      this.currentVisualFrameKey = targetFrameKey;
    }
    this.visual.setScale(1, this.crouched ? 0.64 : 1);
    this.visual.rotation = this.rotation;
    this.visual.setDepth(Depth.PLAYER);
  }

  requestJump(now: number): void {
    if (now < this.hitInputsLockedUntil) return;
    this.jumpBufferedUntil = now + JUMP_BUFFER_MS;
  }
  /** Stops forward motion without touching RUN_SPEED or any physics value. */
  setFrozen(value: boolean): void {
    this.frozen = value;
    if (value) this.setVelocityX(0);
  }

  /** Impulses used in the current airtime; 2 means a double jump just landed. */
  get jumpsThisAirtime(): number {
    return this.jumpCount;
  }

  /** Suspends the player at the top of the current jump until released. */
  requestAirHold(): void {
    this.airHoldRequested = true;
  }

  releaseAirHold(): void {
    this.airHoldRequested = false;
    if (!this.airHolding) return;
    this.airHolding = false;
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
  }

  isCrouched(): boolean {
    return this.crouched;
  }

  setCrouched(value: boolean): void {
    if (value === this.crouched) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body.blocked.down && !body.touching.down) return;
    this.crouched = value;
    this.applyBody(value);
  }
  hurt(): void {
    this.animationState = 'hurt';
  }
  startHitReaction(now: number): void {
    this.speed = HIT_KNOCKBACK_SPEED;
    this.hitSlowUntil = now + HIT_SLOW_DURATION;
    this.hitInputsLockedUntil = now + HIT_INPUT_LOCK_MS;
    this.setVelocityX(HIT_KNOCKBACK_SPEED);
    this.scene.time.delayedCall(HIT_KNOCKBACK_DURATION, () => {
      this.speed = HIT_SLOW_SPEED;
      this.setVelocityX(HIT_SLOW_SPEED);
    });
    this.scene.time.delayedCall(HIT_SLOW_DURATION, () => {
      this.speed = RUN_SPEED;
    });
  }
  halt(): void {
    this.setVelocityX(0);
    this.rotation = 0;
  }

  canAcceptHitInput(now: number): boolean {
    return now >= this.hitInputsLockedUntil;
  }

  private applyBody(crouched: boolean): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const spec = playerBodyFor(crouched);
    body.setSize(spec.width, spec.height).setOffset(spec.offsetX, spec.offsetY);
  }

  destroy(fromScene?: boolean): void {
    this.visual.destroy();
    super.destroy(fromScene);
  }
}
