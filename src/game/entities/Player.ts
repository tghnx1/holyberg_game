import Phaser from 'phaser';
import { Depth, GROUND_Y, JUMP_VELOCITY, RUN_SPEED } from '../constants';
import { canConsumeJump, JUMP_BUFFER_MS, playerBodyFor } from '../level/berlin/playerPhysics';
import type { PlayerAnimationState } from '../level/berlin/types';

export class Player extends Phaser.Physics.Arcade.Sprite {
  animationState: PlayerAnimationState = 'run';
  private crouched = false;
  private jumpBufferedUntil = -Infinity;
  private lastGroundedAt = -Infinity;

  constructor(scene: Phaser.Scene, x: number) {
    super(scene, x, GROUND_Y, 'dj');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(Depth.PLAYER).setCollideWorldBounds(true);
    this.applyBody(false);
    this.syncVisualToBody(false);
  }

  run(now: number): void {
    this.setVelocityX(RUN_SPEED);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body.blocked.down) this.lastGroundedAt = now;
    if (canConsumeJump(now, this.lastGroundedAt, this.jumpBufferedUntil, this.crouched)) {
      this.setVelocityY(JUMP_VELOCITY);
      this.jumpBufferedUntil = -Infinity;
      this.lastGroundedAt = -Infinity;
    }
    this.animationState = this.crouched
      ? 'crouch'
      : body.blocked.down
        ? 'run'
        : body.velocity.y < 0
          ? 'jump'
          : 'fall';
    this.setScale(1, this.crouched ? 0.62 : 1);
    this.rotation = this.crouched ? 0 : Math.sin(now / 80) * 0.025;
  }

  requestJump(now: number): void {
    this.jumpBufferedUntil = now + JUMP_BUFFER_MS;
  }
  setCrouched(value: boolean): void {
    if (value === this.crouched) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (value && !body.blocked.down) return;
    this.crouched = value;
    this.applyBody(value);
    this.syncVisualToBody(value);
  }
  hurt(): void {
    this.animationState = 'hurt';
  }
  halt(): void {
    this.setVelocityX(0);
    this.rotation = 0;
  }

  private applyBody(crouched: boolean): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const spec = playerBodyFor(crouched);
    body.setSize(spec.width, spec.height).setOffset(spec.offsetX, spec.offsetY);
  }

  private syncVisualToBody(crouched: boolean): void {
    this.setY(GROUND_Y);
    this.setScale(1, crouched ? 0.64 : 1);
  }
}
