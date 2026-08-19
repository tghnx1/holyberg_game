/**
 * Phase progression and damage geometry for a single attack.
 *
 * Pure functions of (attack, elapsed time): the scene only decides *when* to
 * ask, never how an attack behaves, so patterns are tunable and testable.
 */
import type {
  ActiveAttack,
  ArenaBounds,
  AttackPhase,
  LaserBeam,
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

/** Center X of a sweep at `progress` (0..1) across the arena. */
export function getSweepCenterX(
  bounds: ArenaBounds,
  direction: 'leftToRight' | 'rightToLeft',
  progress: number,
): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return direction === 'leftToRight'
    ? bounds.minX + (bounds.maxX - bounds.minX) * clamped
    : bounds.maxX - (bounds.maxX - bounds.minX) * clamped;
}

/**
 * The beams an attack projects at `nowMs`.
 *
 * During `telegraph` these are the *warning* positions (identical geometry to
 * the damaging beams, which is what makes the telegraph trustworthy). Callers
 * decide whether to render them as a warning or apply damage from them.
 */
export function getAttackBeams(
  attack: ScheduledAttack,
  nowMs: number,
  bounds: ArenaBounds,
): LaserBeam[] {
  const params = attack.params;
  if (params.type === 'aimedLaser') {
    return [{ centerX: params.targetX, halfWidth: params.halfWidth }];
  }
  if (params.type === 'sweepLaser') {
    // While telegraphing, park the guide at the start edge so the player can
    // see where the sweep begins and which way it will travel.
    const phase = getAttackPhase(attack, nowMs);
    const progress = phase === 'telegraph' ? 0 : getActiveProgress(attack, nowMs);
    return [
      {
        centerX: getSweepCenterX(bounds, params.direction, progress),
        halfWidth: params.halfWidth,
      },
    ];
  }
  return params.columnCenters.map((centerX) => ({ centerX, halfWidth: params.halfWidth }));
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
  bounds: ArenaBounds,
  playerCenterX: number,
  playerHalfWidth: number,
): boolean {
  if (getAttackPhase(attack, nowMs) !== 'active') return false;
  return isPlayerHitByBeams(
    getAttackBeams(attack, nowMs, bounds),
    playerCenterX,
    playerHalfWidth,
  );
}

export const toActiveAttack = (attack: ScheduledAttack): ActiveAttack => ({
  ...attack,
  phase: 'telegraph',
  hitPlayer: false,
  scored: false,
});
