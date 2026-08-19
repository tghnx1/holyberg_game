/**
 * Horizontal movement and dash rules for the boss arena.
 *
 * Pure so the dash window, cooldown and wall clamping can be tested without a
 * running scene. Atmos never jumps or shoots here: the whole fight is a
 * left/right dodge, so this is deliberately one-dimensional.
 */
import { BOSS_PLAYER } from './bossConfig';
import type { ArenaBounds } from './types';

export type MoveDirection = -1 | 0 | 1;

export interface BossPlayerMotion {
  x: number;
  velocityX: number;
  /** When the current dash ends; -Infinity when not dashing. */
  dashUntilMs: number;
  /** Earliest time a new dash may start. */
  dashReadyAtMs: number;
  /** Direction the dash is travelling, so it holds its heading. */
  dashDirection: MoveDirection;
  /** Non-zero while knockback overrides input. */
  knockbackUntilMs: number;
  knockbackVelocityX: number;
}

export const createBossPlayerMotion = (x: number): BossPlayerMotion => ({
  x,
  velocityX: 0,
  dashUntilMs: -Infinity,
  dashReadyAtMs: -Infinity,
  dashDirection: 0,
  knockbackUntilMs: -Infinity,
  knockbackVelocityX: 0,
});

export const isDashing = (motion: BossPlayerMotion, nowMs: number): boolean =>
  nowMs < motion.dashUntilMs;

export const canDash = (motion: BossPlayerMotion, nowMs: number): boolean =>
  nowMs >= motion.dashReadyAtMs && !isDashing(motion, nowMs);

/** 0..1 cooldown recharge, for the HUD dash pip. */
export function getDashCooldownProgress(motion: BossPlayerMotion, nowMs: number): number {
  if (canDash(motion, nowMs)) return 1;
  const remaining = motion.dashReadyAtMs - nowMs;
  return Math.min(1, Math.max(0, 1 - remaining / BOSS_PLAYER.dashCooldownMs));
}

/**
 * Starts a dash if one is available. A neutral input dashes in the direction
 * the player is already travelling, defaulting to right, so a tap never fizzles.
 */
export function startDash(
  motion: BossPlayerMotion,
  nowMs: number,
  direction: MoveDirection,
): BossPlayerMotion {
  if (!canDash(motion, nowMs)) return motion;
  const heading: MoveDirection =
    direction !== 0 ? direction : motion.velocityX < 0 ? -1 : 1;
  return {
    ...motion,
    dashUntilMs: nowMs + BOSS_PLAYER.dashDurationMs,
    dashReadyAtMs: nowMs + BOSS_PLAYER.dashDurationMs + BOSS_PLAYER.dashCooldownMs,
    dashDirection: heading,
    velocityX: BOSS_PLAYER.dashSpeed * heading,
  };
}

/** Applies a knockback impulse away from `fromX`. */
export function applyKnockback(
  motion: BossPlayerMotion,
  nowMs: number,
  fromX: number,
): BossPlayerMotion {
  const away = motion.x < fromX ? -1 : 1;
  return {
    ...motion,
    // A hit cancels the dash so the player is not carried further into a beam.
    dashUntilMs: -Infinity,
    knockbackUntilMs: nowMs + BOSS_PLAYER.knockbackDurationMs,
    knockbackVelocityX: BOSS_PLAYER.knockbackSpeed * away,
  };
}

/**
 * Advances one frame. Priority is knockback > dash > input, so a hit always
 * reads and a dash always completes at full speed.
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
  } else if (isDashing(motion, nowMs)) {
    velocityX = BOSS_PLAYER.dashSpeed * motion.dashDirection;
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
