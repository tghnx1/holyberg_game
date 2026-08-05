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
import { JUMP_BUFFER_MS, playerBodyFor } from '../level/berlin/playerPhysics';
import type { PlayerAnimationState } from '../level/berlin/types';

export class Player extends Phaser.Physics.Arcade.Sprite {
  animationState: PlayerAnimationState = 'run';
  private crouched = false;
  private jumpBufferedUntil = -Infinity;
  private speed = RUN_SPEED;
  private hitInputsLockedUntil = -Infinity;
  private hitSlowUntil = -Infinity;
  private jumpCount = 0;
  private visual: Phaser.GameObjects.Sprite;

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
    this.setVelocityX(this.speed);
    const body = this.body as Phaser.Physics.Arcade.Body;
    const grounded = body.blocked.down || body.touching.down;
    if (grounded) {
      this.jumpCount = 0;
    }
    let jumpedThisFrame = false;
    if (this.jumpBufferedUntil >= now && this.jumpCount < 2 && (grounded || this.jumpCount > 0)) {
      this.setVelocityY(this.jumpCount === 0 ? JUMP_VELOCITY : -680);
      this.jumpBufferedUntil = -Infinity;
      this.jumpCount += 1;
      jumpedThisFrame = true;
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
    this.syncVisual();
  }

  private syncVisual(): void {
    // this.y (origin 0.5,1) is always the sprite's own feet position and is
    // never affected by resizing the physics body, unlike body.y + body.height
    // which reads stale for one frame right after a crouch/stand toggle
    // (the body only resyncs on Phaser's next automatic preUpdate).
    this.visual.x = this.x;
    this.visual.y = this.y;
    this.visual.setScale(1, this.crouched ? 0.64 : 1);
    this.visual.rotation = this.rotation;
    this.visual.setDepth(Depth.PLAYER);
  }

  requestJump(now: number): void {
    if (now < this.hitInputsLockedUntil) return;
    this.jumpBufferedUntil = now + JUMP_BUFFER_MS;
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
