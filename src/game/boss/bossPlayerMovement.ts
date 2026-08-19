/**
 * Horizontal movement rules for the boss arena.
 *
 * Pure so acceleration, knockback and wall clamping can be tested without a
 * running scene. Atmos never jumps, dashes or shoots here: the whole fight is
 * a left/right dodge, so this is deliberately one-dimensional.
 */
import { BOSS_PLAYER } from './bossConfig';
import type { ArenaBounds } from './types';

export type MoveDirection = -1 | 0 | 1;

export interface BossPlayerMotion {
  x: number;
  velocityX: number;
  /** Non-zero while knockback overrides input. */
  knockbackUntilMs: number;
  knockbackVelocityX: number;
}

export const createBossPlayerMotion = (x: number): BossPlayerMotion => ({
  x,
  velocityX: 0,
  knockbackUntilMs: -Infinity,
  knockbackVelocityX: 0,
});

/** Applies a knockback impulse away from `fromX`. */
export function applyKnockback(
  motion: BossPlayerMotion,
  nowMs: number,
  fromX: number,
): BossPlayerMotion {
  const away = motion.x < fromX ? -1 : 1;
  return {
    ...motion,
    knockbackUntilMs: nowMs + BOSS_PLAYER.knockbackDurationMs,
    knockbackVelocityX: BOSS_PLAYER.knockbackSpeed * away,
  };
}

/**
 * Advances one frame. Knockback outranks input, so a hit always reads.
 */
export function stepBossPlayer(
  motion: BossPlayerMotion,
  deltaMs: number,
  direction: MoveDirection,
  nowMs: number,
  bounds: ArenaBounds,
): BossPlayerMotion {
  const deltaSeconds = deltaMs / 1000;
  let velocityX: number;

  if (nowMs < motion.knockbackUntilMs) {
    velocityX = motion.knockbackVelocityX;
  } else {
    const target = BOSS_PLAYER.moveSpeed * direction;
    const step = BOSS_PLAYER.accelerationPxPerSecond2 * deltaSeconds;
    velocityX =
      Math.abs(target - motion.velocityX) <= step
        ? target
        : motion.velocityX + Math.sign(target - motion.velocityX) * step;
  }

  const x = Math.min(bounds.maxX, Math.max(bounds.minX, motion.x + velocityX * deltaSeconds));
  return {
    ...motion,
    x,
    // Stop dead at a wall instead of keeping phantom speed pressed into it.
    velocityX: x === bounds.minX || x === bounds.maxX ? 0 : velocityX,
  };
}
