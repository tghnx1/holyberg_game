import Phaser from 'phaser';
import {
  footOffset,
  loopedFrameIndex,
  RUN_CYCLE_MS,
  staticRunFrameIndex,
} from '../characters/characterAnimation';
import type { CharacterAssetRef, CharacterDefinition } from '../characters/characterManifest';
import { PLAYER_VISUAL_SCALE } from '../entities/Player';
import { BOSS_ARENA, BOSS_PLAYER } from './bossConfig';

/**
 * Standing-still cadence, the arena's own presentation choice rather than
 * character data. Preserves the previous 220ms-per-frame idle across Atmos's
 * six run frames, expressed as a cycle so any frame count keeps the tempo.
 */
const BOSS_IDLE_CYCLE_MS = 1320;
import { BossDepth } from './bossConstants';
import {
  applyKnockback,
  createBossPlayerMotion,
  stepBossPlayer,
  type BossPlayerMotion,
  type MoveDirection,
} from './bossPlayerMovement';
import type { ArenaBounds } from './types';

/**
 * Atmos in the boss arena.
 *
 * This deliberately does not extend the Level 1 `Player`: there is no gravity,
 * jumping, dashing or Arcade body here, only a horizontal dodge. It reuses the
 * shared
 * Atmos frame data so the character looks and aligns to the floor exactly as it
 * does in Level 1.
 */
export class BossPlayer {
  private motion: BossPlayerMotion;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private currentFrameKey?: string;
  private damageFrameUntilMs = -Infinity;

  constructor(
    private readonly scene: Phaser.Scene,
    startX: number,
    private readonly character: CharacterDefinition,
  ) {
    this.motion = createBossPlayerMotion(startX);
    const { run } = character.gameplay;
    this.sprite = scene.add
      .sprite(startX, BOSS_ARENA.floorY, run[staticRunFrameIndex(run.length)].key)
      .setOrigin(0.5, 1)
      .setScale(PLAYER_VISUAL_SCALE)
      .setDepth(BossDepth.PLAYER);
  }

  get x(): number {
    return this.motion.x;
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
    const frame = this.resolveFrame(nowMs, direction);
    if (frame.key !== this.currentFrameKey) {
      this.sprite.setTexture(frame.key);
      this.currentFrameKey = frame.key;
    }
    this.sprite.x = this.motion.x;
    this.sprite.y = BOSS_ARENA.floorY + footOffset(frame.footGap, PLAYER_VISUAL_SCALE);
    // Face the way Atmos is travelling; the run art is drawn facing right.
    if (this.motion.velocityX !== 0) {
      this.sprite.setFlipX(this.motion.velocityX < 0);
    }
  }

  private resolveFrame(nowMs: number, direction: MoveDirection): CharacterAssetRef {
    const { run, damage } = this.character.gameplay;
    if (nowMs < this.damageFrameUntilMs && damage.length > 0) return damage[0];
    // Idle breathes on a slower cadence rather than freezing on one frame.
    const cycle = direction === 0 && this.motion.velocityX === 0 ? BOSS_IDLE_CYCLE_MS : RUN_CYCLE_MS;
    return run[loopedFrameIndex(nowMs, run.length, cycle)];
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
