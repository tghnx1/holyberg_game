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
import {
  ATMOS_CROUCH_FRAME_DURATION_MS,
  ATMOS_CROUCH_FRAME_KEYS,
  ATMOS_DAMAGE_FRAME_KEY,
  ATMOS_JUMP_ASCENT_FRAME_COUNT,
  ATMOS_JUMP_FRAME_DURATION_MS,
  ATMOS_JUMP_FRAME_KEYS,
  ATMOS_JUMP_LANDING_DURATION_MS,
  ATMOS_JUMP_LANDING_FRAME_KEY,
  ATMOS_RUN_FRAME_DURATION_MS,
  ATMOS_RUN_FRAME_KEYS,
  ATMOS_RUN_STATIC_FRAME_KEY,
  ATMOS_STAY_FRAME_KEY,
  ATMOS_VISUAL_SCALE,
  getAtmosFootOffset,
  getLoopedFrame,
  type AtmosFrameKey,
} from './atmosFrames';

// Re-exported so existing importers (BootScene) keep one import site while the
// frame data itself lives in a Phaser-free module shared with the boss arena.
export {
  ATMOS_CROUCH_FRAME_KEYS,
  ATMOS_DAMAGE_FRAME_KEY,
  ATMOS_JUMP_FRAME_KEYS,
  ATMOS_RUN_FRAME_KEYS,
  ATMOS_RUN_STATIC_FRAME_KEY,
  ATMOS_STAY_FRAME_KEY,
} from './atmosFrames';

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
  /** When the current airborne pose started, so jump frames play in order. */
  private jumpAnimStartedAt = -Infinity;
  /** Holds the landing pose for a beat after the feet touch down. */
  private landingAnimUntil = -Infinity;
  private wasGrounded = true;
  /** Shows the damage pose for the duration of the existing knockback. */
  private hitAnimUntil = -Infinity;

  constructor(scene: Phaser.Scene, x: number) {
    super(scene, x, GROUND_Y, ATMOS_STAY_FRAME_KEY);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(Depth.PLAYER).setCollideWorldBounds(true);
    this.applyBody(false);
    this.setScale(1);
    this.setAlpha(0);

    // Shown immediately, before the run starts and before the first run()
    // call ever fires: without this Atmos would flash whatever placeholder
    // texture the constructor happened to pass, for the whole intro screen.
    this.currentVisualFrameKey = ATMOS_STAY_FRAME_KEY;
    this.visual = scene.add.sprite(x, GROUND_Y, ATMOS_STAY_FRAME_KEY);
    this.visual.setOrigin(0.5, 1);
    this.visual.setScale(ATMOS_VISUAL_SCALE);
    this.visual.y = GROUND_Y + getAtmosFootOffset(ATMOS_STAY_FRAME_KEY, ATMOS_VISUAL_SCALE) + 10;
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
    // Restart the jump frames on every impulse, including the second one.
    if (jumpedThisFrame) this.jumpAnimStartedAt = now;
    // Touching down starts the landing pose; jumping again cuts it short.
    if (grounded && !this.wasGrounded) this.landingAnimUntil = now + ATMOS_JUMP_LANDING_DURATION_MS;
    if (jumpedThisFrame) this.landingAnimUntil = -Infinity;
    this.wasGrounded = grounded;
    this.rotation = this.crouched ? 0 : Math.sin(now / 80) * 0.025;
    this.syncVisual(now);
  }

  private syncVisual(now: number): void {
    // this.y (origin 0.5,1) is always the sprite's own feet position and is
    // never affected by resizing the physics body, unlike body.y + body.height
    // which reads stale for one frame right after a crouch/stand toggle
    // (the body only resyncs on Phaser's next automatic preUpdate).
    const targetFrameKey = this.resolveVisualFrameKey(now);
    this.visual.x = this.x;
    this.visual.y = this.y + this.getVisualFootOffset(targetFrameKey, ATMOS_VISUAL_SCALE) + 10;
    if (targetFrameKey !== this.currentVisualFrameKey) {
      this.visual.setTexture(targetFrameKey);
      this.currentVisualFrameKey = targetFrameKey;
    }
    this.visual.setScale(ATMOS_VISUAL_SCALE);
    this.visual.rotation = this.rotation;
    this.visual.setDepth(Depth.PLAYER);
  }

  private resolveVisualFrameKey(now: number): AtmosFrameKey {
    // Obstacle knockback pre-empts whatever pose run()/crouch would show.
    if (now < this.hitAnimUntil) return ATMOS_DAMAGE_FRAME_KEY;
    switch (this.animationState) {
      case 'run':
        if (this.frozen) return ATMOS_STAY_FRAME_KEY;
        return now < this.landingAnimUntil
          ? ATMOS_JUMP_LANDING_FRAME_KEY
          : getLoopedFrame(ATMOS_RUN_FRAME_KEYS, now, ATMOS_RUN_FRAME_DURATION_MS);
      case 'jump':
      case 'doubleJump':
      case 'fall': {
        const step = Math.floor((now - this.jumpAnimStartedAt) / ATMOS_JUMP_FRAME_DURATION_MS);
        // Ascending walks frames 1-4; the fall holds on frame 4. Frame 5 is
        // the landing pose and never plays while the player is still airborne.
        const index = this.animationState === 'fall'
          ? ATMOS_JUMP_ASCENT_FRAME_COUNT - 1
          : Math.min(ATMOS_JUMP_ASCENT_FRAME_COUNT - 1, Math.max(0, step));
        return ATMOS_JUMP_FRAME_KEYS[index];
      }
      case 'crouch':
        return getLoopedFrame(ATMOS_CROUCH_FRAME_KEYS, now, ATMOS_CROUCH_FRAME_DURATION_MS);
      default:
        return ATMOS_RUN_STATIC_FRAME_KEY;
    }
  }

  private getVisualFootOffset(frameKey: AtmosFrameKey, visualScale: number): number {
    return getAtmosFootOffset(frameKey, visualScale);
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
    this.hitAnimUntil = now + HIT_KNOCKBACK_DURATION + 100;
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
