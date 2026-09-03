/**
 * Horizontal movement rules for the boss arena.
 *
 * Pure so acceleration, knockback and wall clamping can be tested without a
 * running scene. The player never jumps, dashes or shoots here: the whole fight is
 * a left/right dodge, so this is deliberately one-dimensional.
 */
import {
  resolveGameplayScale,
  type CharacterDefinition,
  type CharacterGameplayPose,
} from '../characters/characterManifest';
import { BOSS_PLAYER } from './bossConfig';
import type { ArenaBounds } from './types';

export type MoveDirection = -1 | 0 | 1;

/** The editor-authored drawing transform, as far as movement is concerned. */
export interface PlayerVisualPresentation {
  offsetX: number;
  scale: number;
}

/** Poses the boss arena can actually draw; the fight has no jump or crouch. */
const BOSS_POSES: readonly CharacterGameplayPose[] = ['idle', 'run', 'damage'];

/**
 * How far the visible character reaches to either side of its sprite centre,
 * in world pixels.
 *
 * Taken as the widest boss-arena pose rather than the live frame: a run cycle
 * swings its arms, and a per-frame width would breathe the arena walls in and
 * out a few pixels every frame. The widest pose is also the only one that
 * guarantees no pose clips an edge.
 *
 * Both scales matter and neither is a constant: the character manifest's own
 * per-pose gameplay scale, and the editor-authored multiplier on top of it —
 * which is why resizing the player in SceneEditor moves these limits with it.
 */
export function visiblePlayerHalfWidth(
  character: CharacterDefinition,
  presentationScale: number,
): number {
  const { idle, run, damage } = character.gameplay;
  const framesByPose: Record<string, readonly { bodyHalfWidth: number }[]> = {
    idle: idle ? [idle] : [],
    run,
    damage,
  };
  let widest = 0;
  for (const pose of BOSS_POSES) {
    const poseScale = resolveGameplayScale(character, pose);
    for (const frame of framesByPose[pose]) {
      widest = Math.max(widest, frame.bodyHalfWidth * poseScale);
    }
  }
  return widest * Math.abs(presentationScale);
}

/**
 * The band `motion.x` may occupy so that the *drawn* character stays inside
 * the arena.
 *
 * The thing the player sees and steers is the sprite, and the sprite is not
 * `motion.x`: it is drawn at `motion.x + presentation.offsetX`, at a scale the
 * editor may also have changed. Clamping the anchor against the raw arena
 * therefore walls the player off from one edge and lets them walk out through
 * the other by exactly that offset. Subtracting the offset — and insetting by
 * the body's own half-width — turns the arena the player can see into the
 * band the anchor may use, so both edges land where the artwork does.
 */
export function resolvePlayerMotionBounds(
  arena: ArenaBounds,
  visibleHalfWidth: number,
  presentation: PlayerVisualPresentation,
): ArenaBounds {
  const minX = arena.minX + visibleHalfWidth - presentation.offsetX;
  const maxX = arena.maxX - visibleHalfWidth - presentation.offsetX;
  // A character wider than the arena would otherwise get an inverted band and
  // clamp to whichever edge `Math.min`/`Math.max` reached last; pinning it to
  // the centre keeps it visibly centred instead.
  if (minX > maxX) {
    const centre = (minX + maxX) / 2;
    return { minX: centre, maxX: centre };
  }
  return { minX, maxX };
}

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
