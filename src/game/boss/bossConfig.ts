/**
 * All Level 3 tuning lives here, separate from attack execution, so patterns
 * can be retuned without touching runtime or rendering code.
 */
import type { AttackTiming, BossAttackType, BossPhaseDefinition } from './types';

/** Arena geometry in design-space units, relative to the camera each frame. */
export const BOSS_ARENA = {
  /** Horizontal inset from the camera edges that walls the playfield in. */
  sideMarginPx: 70,
  /** Feet line for the player; the arena floor. */
  floorY: 640,
  /** Boss sits above this, the player below it. */
  bossCenterY: 200,
  /** Half-width of the beam where it leaves the boss, before it fans out. */
  laserOriginHalfWidth: 11,
} as const;

export const BOSS_PLAYER = {
  hitPoints: 3,
  /** Horizontal run speed in px/s; the only way the player avoids a laser. */
  moveSpeed: 430,
  /** Acceleration ramp keeps input responsive without feeling slippery. */
  accelerationPxPerSecond2: 4200,
  /** Half-width of the damage box; kept close to the visible character torso. */
  hitHalfWidth: 14,
  knockbackSpeed: 300,
  knockbackDurationMs: 180,
  invulnerabilityMs: 1100,
} as const;

/** Base phase durations per attack type, before per-phase telegraph scaling. */
export const ATTACK_TIMINGS: Record<BossAttackType, AttackTiming> = {
  aimedLaser: { telegraphMs: 820, activeMs: 260, recoveryMs: 260 },
  laserWall: { telegraphMs: 950, activeMs: 620, recoveryMs: 340 },
};

export const ATTACK_SHAPES = {
  aimedLaser: {
    halfWidthPx: 30,
  },
  laserWall: {
    halfWidthPx: 26,
    columnCount: 4,
    /** Opening the player fits through, comfortably wider than their hitbox. */
    safeGapHalfWidthPx: 78,
  },
} as const;

/**
 * Escalating fight structure. Total duration is the sum of these phases; the
 * player wins by surviving all of them.
 */
export const BOSS_PHASES: readonly BossPhaseDefinition[] = [
  {
    index: 0,
    label: 'PHASE 1',
    durationMs: 22_000,
    pattern: ['aimedLaser'],
    gapMs: 900,
    telegraphScale: 1.35,
  },
  {
    index: 1,
    label: 'PHASE 2',
    durationMs: 24_000,
    pattern: ['aimedLaser', 'laserWall', 'aimedLaser'],
    gapMs: 620,
    telegraphScale: 1.1,
  },
  {
    index: 2,
    label: 'PHASE 3',
    durationMs: 26_000,
    pattern: ['aimedLaser', 'laserWall', 'aimedLaser', 'laserWall'],
    gapMs: 480,
    telegraphScale: 0.95,
  },
  {
    index: 3,
    label: 'FINAL',
    durationMs: 14_000,
    pattern: ['aimedLaser', 'laserWall', 'aimedLaser'],
    gapMs: 360,
    telegraphScale: 0.85,
  },
];

export const BOSS_FIGHT_DURATION_MS = BOSS_PHASES.reduce(
  (total, phase) => total + phase.durationMs,
  0,
);

/**
 * Telegraphs never drop below this, whatever the phase scaling says, so every
 * attack stays avoidable by reaction rather than memorisation.
 */
export const MINIMUM_TELEGRAPH_MS = 520;

export const BOSS_SCORING = {
  dodgeScore: 100,
  hitPenalty: 500,
  survivalBonus: 2000,
  flawlessBonus: 5000,
  /** Combo thresholds, highest first; the first match wins. */
  multiplierTiers: [
    { combo: 12, multiplier: 4 },
    { combo: 8, multiplier: 3 },
    { combo: 4, multiplier: 2 },
  ],
} as const;
