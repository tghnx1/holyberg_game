import { describe, expect, it } from 'vitest';
import { BOSS_PLAYER } from '../src/game/boss/bossConfig';
import {
  applyKnockback,
  createBossPlayerMotion,
  resolvePlayerMotionBounds,
  stepBossPlayer,
  visiblePlayerHalfWidth,
} from '../src/game/boss/bossPlayerMovement';
import { resolveGameplayScale } from '../src/game/characters/characterManifest';
import { getCharacter } from '../src/game/characters/characterRegistry';
import type { ArenaBounds } from '../src/game/boss/types';
import { FIXTURE_DAMAGE_BODY_HALF_WIDTH } from './fixtures/characterManifest';

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

describe('visible arena bounds', () => {
  const atmos = getCharacter('atmos');
  const arena: ArenaBounds = { minX: 70, maxX: 1210 };
  /** The authored BossScene offset really is this large; see sceneLayout.json. */
  const presentation = { offsetX: 132.5, scale: 1.17 };

  const visibleX = (motionX: number): number => motionX + presentation.offsetX;

  it('measures the widest drawn pose, not the padded frame or a hardcoded width', () => {
    const halfWidth = visiblePlayerHalfWidth(atmos, presentation.scale);
    // The widest pose is what the walls must accommodate, so no pose clips one.
    expect(halfWidth).toBeCloseTo(
      FIXTURE_DAMAGE_BODY_HALF_WIDTH * resolveGameplayScale(atmos, 'damage') * presentation.scale,
    );
    // Every scale in the chain is live: doubling the editor scale doubles it.
    expect(visiblePlayerHalfWidth(atmos, presentation.scale * 2)).toBeCloseTo(halfWidth * 2);
    // Mirroring the character cannot shrink its footprint.
    expect(visiblePlayerHalfWidth(atmos, -presentation.scale)).toBeCloseTo(halfWidth);
  });

  it('puts the visible body against both arena edges, symmetrically', () => {
    const halfWidth = visiblePlayerHalfWidth(atmos, presentation.scale);
    const derived = resolvePlayerMotionBounds(arena, halfWidth, presentation);

    expect(visibleX(derived.minX)).toBeCloseTo(arena.minX + halfWidth);
    expect(visibleX(derived.maxX)).toBeCloseTo(arena.maxX - halfWidth);
    // Equal clearance on both sides is the symmetry the raw clamp destroyed.
    expect(visibleX(derived.minX) - arena.minX).toBeCloseTo(arena.maxX - visibleX(derived.maxX));
  });

  it('reaches the left edge and stops short of the right one', () => {
    const halfWidth = visiblePlayerHalfWidth(atmos, presentation.scale);
    const derived = resolvePlayerMotionBounds(arena, halfWidth, presentation);
    // The bug: clamping the anchor left the body 132px shy of the left wall
    // and 132px past the right one.
    expect(derived.minX).toBeLessThan(arena.minX);
    expect(derived.maxX).toBeLessThan(arena.maxX);
  });

  it('collapses to the centre rather than inverting for an oversized body', () => {
    const derived = resolvePlayerMotionBounds({ minX: 100, maxX: 200 }, 400, {
      offsetX: 0,
      scale: 1,
    });
    expect(derived.minX).toBe(derived.maxX);
    expect(derived.minX).toBe(150);
  });

  it('keeps a zero offset and zero width identical to the raw arena', () => {
    expect(resolvePlayerMotionBounds(arena, 0, { offsetX: 0, scale: 1 })).toEqual(arena);
  });
});
