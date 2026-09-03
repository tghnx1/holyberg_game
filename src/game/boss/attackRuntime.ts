/**
 * Phase progression and damage geometry for a single attack.
 *
 * Pure functions of (attack, elapsed time): the scene only decides *when* to
 * ask, never how an attack behaves, so patterns are tunable and testable.
 */
import { BOSS_ARENA } from './bossConfig';
import type {
  ActiveAttack,
  AttackPhase,
  LaserBeam,
  LaserPolygon,
  ScheduledAttack,
} from './types';

export const getAttackDurationMs = (attack: ScheduledAttack): number =>
  attack.timing.telegraphMs + attack.timing.activeMs + attack.timing.recoveryMs;

export const getActiveStartMs = (attack: ScheduledAttack): number =>
  attack.startMs + attack.timing.telegraphMs;

export const getActiveEndMs = (attack: ScheduledAttack): number =>
  getActiveStartMs(attack) + attack.timing.activeMs;

/** Which phase `attack` is in at fight-clock time `nowMs`. */
export function getAttackPhase(attack: ScheduledAttack, nowMs: number): AttackPhase {
  const elapsed = nowMs - attack.startMs;
  if (elapsed < 0) return 'telegraph';
  if (elapsed < attack.timing.telegraphMs) return 'telegraph';
  if (elapsed < attack.timing.telegraphMs + attack.timing.activeMs) return 'active';
  if (elapsed < getAttackDurationMs(attack)) return 'recovery';
  return 'done';
}

/** 0..1 progress through the telegraph, for a windup that reads at a glance. */
export function getTelegraphProgress(attack: ScheduledAttack, nowMs: number): number {
  if (attack.timing.telegraphMs <= 0) return 1;
  const elapsed = nowMs - attack.startMs;
  return Math.min(1, Math.max(0, elapsed / attack.timing.telegraphMs));
}

/** 0..1 progress through the damaging window. */
export function getActiveProgress(attack: ScheduledAttack, nowMs: number): number {
  if (attack.timing.activeMs <= 0) return 1;
  const elapsed = nowMs - getActiveStartMs(attack);
  return Math.min(1, Math.max(0, elapsed / attack.timing.activeMs));
}

/**
 * The beams an attack projects at `nowMs`, as floor footprints.
 *
 * These are fixed for the whole attack: the geometry a telegraph shows is
 * exactly the geometry that damages, which is what makes a warning
 * trustworthy. Callers decide whether to draw them as a warning or apply
 * damage from them.
 */
export function getAttackBeams(attack: ScheduledAttack): LaserBeam[] {
  const params = attack.params;
  if (params.type === 'aimedLaser') {
    return [{ centerX: params.targetX, halfWidth: params.halfWidth }];
  }
  return params.columnCenters.map((centerX) => ({ centerX, halfWidth: params.halfWidth }));
}

/**
 * Builds the quad a beam occupies on screen: it leaves the boss as a narrow
 * muzzle and fans out to its floor footprint.
 *
 * Every laser is anchored to `bossX` here, so nothing can ever be drawn
 * dropping out of empty air. Only the footprint is used for collision, so this
 * is presentation geometry derived from the same beam.
 */
export function getBeamPolygon(
  beam: LaserBeam,
  origin: { x: number; y: number },
  floorY: number = BOSS_ARENA.floorY,
  originHalfWidth: number = BOSS_ARENA.laserOriginHalfWidth,
): LaserPolygon {
  return {
    points: [
      origin.x - originHalfWidth,
      origin.y,
      origin.x + originHalfWidth,
      origin.y,
      beam.centerX + beam.halfWidth,
      floorY,
      beam.centerX - beam.halfWidth,
      floorY,
    ],
    originX: origin.x,
    originY: origin.y,
    footprintCenterX: beam.centerX,
  };
}

/** True when the player's horizontal hit box overlaps any damaging beam. */
export function isPlayerHitByBeams(
  beams: readonly LaserBeam[],
  playerCenterX: number,
  playerHalfWidth: number,
): boolean {
  return beams.some(
    (beam) => Math.abs(beam.centerX - playerCenterX) < beam.halfWidth + playerHalfWidth,
  );
}

/**
 * Full per-frame collision test: only the `active` phase can damage, so a
 * telegraph is never a trap.
 */
export function isAttackDamagingPlayer(
  attack: ScheduledAttack,
  nowMs: number,
  playerCenterX: number,
  playerHalfWidth: number,
): boolean {
  if (getAttackPhase(attack, nowMs) !== 'active') return false;
  return isPlayerHitByBeams(getAttackBeams(attack), playerCenterX, playerHalfWidth);
}

export const toActiveAttack = (attack: ScheduledAttack): ActiveAttack => ({
  ...attack,
  phase: 'telegraph',
  hitPlayer: false,
  scored: false,
});
