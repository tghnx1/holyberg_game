import { describe, expect, it } from 'vitest';
import { BOSS_PLAYER } from '../src/game/boss/bossConfig';
import {
  applyKnockback,
  createBossPlayerMotion,
  stepBossPlayer,
} from '../src/game/boss/bossPlayerMovement';
import type { ArenaBounds } from '../src/game/boss/types';

const bounds: ArenaBounds = { minX: 70, maxX: 1210 };

/** Runs `frames` of 16 ms with a fixed input direction. */
function run(
  motion: ReturnType<typeof createBossPlayerMotion>,
  direction: -1 | 0 | 1,
  frames: number,
  startMs = 0,
) {
  let current = motion;
  let now = startMs;
  for (let frame = 0; frame < frames; frame += 1) {
    now += 16;
    current = stepBossPlayer(current, 16, direction, now, bounds);
  }
  return { motion: current, now };
}

describe('boss player movement', () => {
  it('accelerates to the configured run speed and no further', () => {
    const { motion } = run(createBossPlayerMotion(600), 1, 60);
    expect(motion.velocityX).toBeCloseTo(BOSS_PLAYER.moveSpeed);
  });

  it('clamps to the arena walls and drops phantom speed there', () => {
    const { motion } = run(createBossPlayerMotion(600), -1, 400);
    expect(motion.x).toBe(bounds.minX);
    expect(motion.velocityX).toBe(0);

    const right = run(createBossPlayerMotion(600), 1, 400);
    expect(right.motion.x).toBe(bounds.maxX);
  });

  it('knocks the player away from the beam that hit them', () => {
    const knocked = applyKnockback(createBossPlayerMotion(600), 1000, 700);
    expect(knocked.knockbackVelocityX).toBe(-BOSS_PLAYER.knockbackSpeed);

    const fromLeft = applyKnockback(createBossPlayerMotion(600), 1000, 500);
    expect(fromLeft.knockbackVelocityX).toBe(BOSS_PLAYER.knockbackSpeed);
  });

  it('lets knockback override held input until it expires', () => {
    const knocked = applyKnockback(createBossPlayerMotion(600), 1000, 700);
    // Holding right while being knocked left still moves left.
    const during = stepBossPlayer(knocked, 16, 1, 1050, bounds);
    expect(during.x).toBeLessThan(600);
    const after = stepBossPlayer(knocked, 16, 1, 1000 + BOSS_PLAYER.knockbackDurationMs + 1, bounds);
    expect(after.x).toBeGreaterThan(600);
  });
});
