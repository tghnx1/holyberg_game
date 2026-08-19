/** Level 3 boss-fight domain types. Kept free of Phaser so they stay testable. */

export type BossAttackType = 'aimedLaser' | 'laserWall';

/**
 * Every attack runs the same three phases. Only `active` deals damage, so a
 * telegraph is always long enough to read and react to.
 */
export type AttackPhase = 'telegraph' | 'active' | 'recovery' | 'done';

/** Horizontal band [minX, maxX) the player may occupy and lasers may cover. */
export interface ArenaBounds {
  minX: number;
  maxX: number;
}

/**
 * One damaging laser, resolved for an instant in time.
 *
 * Every laser is fired by the boss and lands on a column of the floor, so a
 * beam is described by where it lands. `centerX`/`halfWidth` are the footprint
 * at the player's feet, which is also where collision is resolved.
 */
export interface LaserBeam {
  centerX: number;
  halfWidth: number;
}

/** Screen-space quad of a beam, from the boss muzzle down to its footprint. */
export interface LaserPolygon {
  /** x,y pairs: muzzle left, muzzle right, floor right, floor left. */
  points: readonly number[];
  originX: number;
  originY: number;
  footprintCenterX: number;
}

export interface AimedLaserParams {
  type: 'aimedLaser';
  /** Player X sampled when the telegraph started; the beam fires through it. */
  targetX: number;
  halfWidth: number;
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

export type AttackParams = AimedLaserParams | LaserWallParams;

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
