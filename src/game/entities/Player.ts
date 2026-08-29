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
import {
  computePlayerBodyOffset,
  JUMP_BUFFER_MS,
  playerBodyFor,
  resolveJumpImpulse,
} from '../level/berlin/playerPhysics';
import type { PlayerAnimationState } from '../level/berlin/types';
import {
  CROUCH_CYCLE_MS,
  footOffset,
  JUMP_LANDING_HOLD_MS,
  jumpFrameIndex,
  landingFrameIndex,
  loopedFrameIndex,
  RUN_CYCLE_MS,
  staticRunFrameIndex,
} from '../characters/characterAnimation';
import {
  resolveGameplayScale,
  type CharacterAssetRef,
  type CharacterDefinition,
  type CharacterGameplayPose,
} from '../characters/characterManifest';

// Re-exported so existing importers (BootScene) keep one import site while the
// frame data itself lives in a Phaser-free module shared with the boss arena.

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

  private readonly character: CharacterDefinition;

  constructor(scene: Phaser.Scene, x: number, character: CharacterDefinition) {
    super(scene, x, GROUND_Y, character.gameplay.idle!.key);
    this.character = character;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(Depth.PLAYER).setCollideWorldBounds(true);
    this.applyBody(false);
    this.setScale(1);
    this.setAlpha(0);

    // Shown immediately, before the run starts and before the first run()
    // call ever fires: without this the player would flash whatever placeholder
    // texture the constructor happened to pass, for the whole intro screen.
    const idle = character.gameplay.idle!;
    this.currentVisualFrameKey = idle.key;
    this.visual = scene.add.sprite(x, GROUND_Y, idle.key);
    this.visual.setOrigin(0.5, 1);
    const idleScale = this.resolveVisualScale('idle');
    this.visual.setScale(idleScale);
    this.visual.y = GROUND_Y + footOffset(idle.footGap, idleScale) + 10;
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
    if (grounded && !this.wasGrounded) this.landingAnimUntil = now + JUMP_LANDING_HOLD_MS;
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
    const frame = this.resolveVisualFrame(now);
    const scale = this.resolveVisualScale(this.resolveVisualPose(now));
    this.visual.x = this.x;
    this.visual.y = this.y + footOffset(frame.footGap, scale) + 10;
    if (frame.key !== this.currentVisualFrameKey) {
      this.visual.setTexture(frame.key);
      this.currentVisualFrameKey = frame.key;
    }
    this.visual.setScale(scale);
    this.visual.rotation = this.rotation;
    this.visual.setDepth(Depth.PLAYER);
  }

  private resolveVisualPose(now: number): CharacterGameplayPose {
    if (now < this.hitAnimUntil && this.character.gameplay.damage.length > 0) return 'damage';
    switch (this.animationState) {
      case 'run':
        if (this.frozen && this.character.gameplay.idle) return 'idle';
        if (now < this.landingAnimUntil && this.character.gameplay.jump.length > 0) return 'jump';
        return 'run';
      case 'jump':
      case 'doubleJump':
      case 'fall':
        return 'jump';
      case 'crouch':
        return 'crouch';
      default:
        return 'run';
    }
  }

  private resolveVisualScale(pose: CharacterGameplayPose): number {
    return resolveGameplayScale(this.character, pose);
  }

  /**
   * Which artwork this frame, as a manifest ref so the foot gap travels with
   * the key. Frame *counts* come from the character; every duration comes
   * from characterAnimation and is the same for everyone.
   */
  private resolveVisualFrame(now: number): CharacterAssetRef {
    const { run, jump, crouch, damage, idle } = this.character.gameplay;
    // Obstacle knockback pre-empts whatever pose run()/crouch would show.
    // Only the first damage frame is used, as before; the rest stay
    // discovered but unplayed until a damage animation is designed.
    if (now < this.hitAnimUntil && damage.length > 0) return damage[0];
    switch (this.animationState) {
      case 'run':
        if (this.frozen && idle) return idle;
        if (now < this.landingAnimUntil && jump.length > 0) {
          return jump[landingFrameIndex(jump.length)];
        }
        return run[loopedFrameIndex(now, run.length, RUN_CYCLE_MS)];
      case 'jump':
      case 'doubleJump':
      case 'fall': {
        // Ascending walks the airborne frames; a fall holds the last of them.
        // The landing pose is reserved and never plays mid-air.
        const airborneLast = Math.max(0, jump.length - 2);
        const index =
          this.animationState === 'fall'
            ? airborneLast
            : jumpFrameIndex(now - this.jumpAnimStartedAt, jump.length);
        return jump[index];
      }
      case 'crouch':
        return crouch[loopedFrameIndex(now, crouch.length, CROUCH_CYCLE_MS)];
      default:
        return run[staticRunFrameIndex(run.length)];
    }
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
    // Aligned against this physics sprite's own current frame (always
    // the idle frame's dimensions — its texture never changes; only
    // the separate `visual` sprite swaps animation frames), not a hardcoded
    // placeholder size.
    const offset = computePlayerBodyOffset(this.width, this.height, spec);
    body.setSize(spec.width, spec.height).setOffset(offset.offsetX, offset.offsetY);
  }

  destroy(fromScene?: boolean): void {
    this.visual.destroy();
    super.destroy(fromScene);
  }
}
