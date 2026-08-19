/** Level 3 boss-fight domain types. Kept free of Phaser so they stay testable. */

export type BossAttackType = 'aimedLaser' | 'sweepLaser' | 'laserWall';

/**
 * Every attack runs the same three phases. Only `active` deals damage, so a
 * telegraph is always long enough to read and react to.
 */
export type AttackPhase = 'telegraph' | 'active' | 'recovery' | 'done';

export type SweepDirection = 'leftToRight' | 'rightToLeft';

/** Horizontal band [minX, maxX) the player may occupy and lasers may cover. */
export interface ArenaBounds {
  minX: number;
  maxX: number;
}

/** A single damaging vertical laser column, resolved for one instant in time. */
export interface LaserBeam {
  centerX: number;
  halfWidth: number;
}

export interface AimedLaserParams {
  type: 'aimedLaser';
  /** Player X sampled when the telegraph started; the beam fires through it. */
  targetX: number;
  halfWidth: number;
}

export interface SweepLaserParams {
  type: 'sweepLaser';
  direction: SweepDirection;
  halfWidth: number;
  /** Pixels per second. Must stay under the player's run speed to be fair. */
  speed: number;
}

export interface LaserWallParams {
  type: 'laserWall';
  /** Center X of each column, left to right. */
  columnCenters: readonly number[];
  halfWidth: number;
  /** Center X of the readable opening the player must move into. */
  safeGapCenterX: number;
  safeGapHalfWidth: number;
}

export type AttackParams = AimedLaserParams | SweepLaserParams | LaserWallParams;

/** Phase durations in milliseconds, resolved per attack from tuning data. */
export interface AttackTiming {
  telegraphMs: number;
  activeMs: number;
  recoveryMs: number;
}

/** A scheduled attack: what to fire, when, and with which timings. */
export interface ScheduledAttack {
  id: number;
  type: BossAttackType;
  phaseIndex: number;
  /** Fight-clock milliseconds at which the telegraph begins. */
  startMs: number;
  timing: AttackTiming;
  /**
   * Resolved at schedule time except for `aimedLaser.targetX`, which is
   * sampled from the live player when the telegraph starts.
   */
  params: AttackParams;
}

/** Live state of an attack the fight is currently running. */
export interface ActiveAttack extends ScheduledAttack {
  phase: AttackPhase;
  /** True once this attack has damaged the player; it can only land once. */
  hitPlayer: boolean;
  /** True once the attack has been settled into the score. */
  scored: boolean;
}

export interface BossPhaseDefinition {
  index: number;
  label: string;
  durationMs: number;
  /** Attack types this phase may schedule, in the order it cycles them. */
  pattern: readonly BossAttackType[];
  /** Quiet time between one attack's recovery ending and the next telegraph. */
  gapMs: number;
  /** Multiplies the base telegraph duration; >1 is more generous. */
  telegraphScale: number;
}
