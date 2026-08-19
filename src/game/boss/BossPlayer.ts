import Phaser from 'phaser';
import {
  ATMOS_CROUCH_FRAME_DURATION_MS,
  ATMOS_DAMAGE_FRAME_KEY,
  ATMOS_JUMP_FRAME_KEYS,
  ATMOS_RUN_FRAME_DURATION_MS,
  ATMOS_RUN_FRAME_KEYS,
  ATMOS_RUN_STATIC_FRAME_KEY,
  ATMOS_VISUAL_SCALE,
  getAtmosFootOffset,
  getLoopedFrame,
  type AtmosFrameKey,
} from '../entities/atmosFrames';
import { BOSS_ARENA, BOSS_PLAYER } from './bossConfig';
import { BossDepth } from './bossConstants';
import {
  applyKnockback,
  createBossPlayerMotion,
  getDashCooldownProgress,
  isDashing,
  startDash,
  stepBossPlayer,
  type BossPlayerMotion,
  type MoveDirection,
} from './bossPlayerMovement';
import type { ArenaBounds } from './types';

/**
 * Atmos in the boss arena.
 *
 * This deliberately does not extend the Level 1 `Player`: there is no gravity,
 * jumping or Arcade body here, only a horizontal dodge. It reuses the shared
 * Atmos frame data so the character looks and aligns to the floor exactly as it
 * does in Level 1.
 */
export class BossPlayer {
  private motion: BossPlayerMotion;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly dashTrail: Phaser.GameObjects.Graphics;
  private currentFrameKey?: AtmosFrameKey;
  private damageFrameUntilMs = -Infinity;

  constructor(
    private readonly scene: Phaser.Scene,
    startX: number,
  ) {
    this.motion = createBossPlayerMotion(startX);
    this.dashTrail = scene.add.graphics().setDepth(BossDepth.PLAYER - 1);
    this.sprite = scene.add
      .sprite(startX, BOSS_ARENA.floorY, ATMOS_RUN_STATIC_FRAME_KEY)
      .setOrigin(0.5, 1)
      .setScale(ATMOS_VISUAL_SCALE)
      .setDepth(BossDepth.PLAYER);
  }

  get x(): number {
    return this.motion.x;
  }

  get dashCooldownProgress(): number {
    return getDashCooldownProgress(this.motion, this.scene.time.now);
  }

  requestDash(direction: MoveDirection, nowMs: number): void {
    const before = this.motion.dashUntilMs;
    this.motion = startDash(this.motion, nowMs, direction);
    if (this.motion.dashUntilMs !== before) this.emitDashBurst();
  }

  /** Plays the damage pose, knocks Atmos away from the beam and blinks. */
  onHit(nowMs: number, beamCenterX: number): void {
    this.motion = applyKnockback(this.motion, nowMs, beamCenterX);
    this.damageFrameUntilMs = nowMs + BOSS_PLAYER.knockbackDurationMs;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAlpha(1);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: { from: 1, to: 0.35 },
      duration: 120,
      yoyo: true,
      repeat: Math.floor(BOSS_PLAYER.invulnerabilityMs / 240),
      onComplete: () => this.sprite.setAlpha(1),
    });
  }

  update(deltaMs: number, direction: MoveDirection, nowMs: number, bounds: ArenaBounds): void {
    this.motion = stepBossPlayer(this.motion, deltaMs, direction, nowMs, bounds);
    const frameKey = this.resolveFrameKey(nowMs, direction);
    if (frameKey !== this.currentFrameKey) {
      this.sprite.setTexture(frameKey);
      this.currentFrameKey = frameKey;
    }
    this.sprite.x = this.motion.x;
    this.sprite.y = BOSS_ARENA.floorY + getAtmosFootOffset(frameKey);
    // Face the way Atmos is travelling; the run art is drawn facing right.
    if (this.motion.velocityX !== 0) {
      this.sprite.setFlipX(this.motion.velocityX < 0);
    }
    this.drawDashTrail(nowMs);
  }

  private resolveFrameKey(nowMs: number, direction: MoveDirection): AtmosFrameKey {
    if (nowMs < this.damageFrameUntilMs) return ATMOS_DAMAGE_FRAME_KEY;
    // The tucked airborne pose doubles as a convincing dash.
    if (isDashing(this.motion, nowMs)) return ATMOS_JUMP_FRAME_KEYS[3];
    if (direction === 0 && this.motion.velocityX === 0) {
      // Idle breathes on the crouch cadence rather than freezing on one frame.
      return getLoopedFrame(ATMOS_RUN_FRAME_KEYS, nowMs, ATMOS_CROUCH_FRAME_DURATION_MS * 2);
    }
    return getLoopedFrame(ATMOS_RUN_FRAME_KEYS, nowMs, ATMOS_RUN_FRAME_DURATION_MS);
  }

  private emitDashBurst(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: { from: ATMOS_VISUAL_SCALE * 1.15, to: ATMOS_VISUAL_SCALE },
      duration: BOSS_PLAYER.dashDurationMs,
      ease: 'Quad.easeOut',
    });
  }

  private drawDashTrail(nowMs: number): void {
    this.dashTrail.clear();
    if (!isDashing(this.motion, nowMs)) return;
    const behind = this.motion.dashDirection * -1;
    for (let step = 1; step <= 3; step += 1) {
      this.dashTrail.fillStyle(0x56ffff, 0.22 / step);
      this.dashTrail.fillRect(
        this.motion.x + behind * step * 26 - 12,
        BOSS_ARENA.floorY - 120,
        24,
        120,
      );
    }
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
    this.dashTrail.destroy();
  }
}
