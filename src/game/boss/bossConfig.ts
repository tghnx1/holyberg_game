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
  /** Horizontal run speed in px/s; the only way the player avoids a laser. */
  moveSpeed: 430,
  /** Acceleration ramp keeps input responsive without feeling slippery. */
  accelerationPxPerSecond2: 4200,
  /** Half-width of the damage box; kept close to the visible character torso. */
  hitHalfWidth: 14,
  knockbackSpeed: 300,
  knockbackDurationMs: 180,
  /**
   * Still here without lives: it stops one laser wall counting as several hits
   * while the player stands in it. Nothing about it can end the fight.
   */
  invulnerabilityMs: 1100,
} as const;

/**
 * Emerald collectibles.
 *
 * *Where* they are is authored, not tuned: the spots are objects placed in
 * SceneEditor and saved to `sceneLayout.json`, exactly like Level 1's
 * collectibles. What is left here is which of those spots a given telegraph
 * offers, and how big the pickup box is.
 *
 * `reachableFraction` is what keeps an offer fair. The furthest spot a
 * telegraph will show is the distance the player could cover in the time it
 * grants, times this — well under 1, so there is time to reach it *and* leave
 * again, and the acceleration ramp is comfortably absorbed.
 */
export const BOSS_EMERALDS = {
  /** Fraction of the telegraph's travel distance an emerald may sit within. */
  reachableFraction: 0.55,
  /** Never offer one the player is already standing on; it must be worth running to. */
  minPlayerDistancePx: 90,
  /** Half-extent of the pickup box at scale 1, and the drawn size to match. */
  halfSizePx: 26,
  /**
   * Narrows the player's standing silhouette to the body you actually run
   * into. Below 1 on purpose: even a still character's outline includes hands
   * held away from the torso, and collecting with those reads as picking an
   * emerald up from a step away.
   */
  pickupWidthFactor: 0.62,
  /**
   * Trims the same silhouette's height. Just under 1, so an emerald level with
   * the very top of the head is not swept up, while anything at body height
   * is.
   */
  pickupHeightFactor: 0.9,
  /** Default height above the floor for a newly placed spot: leg height. */
  floorOffsetPx: 62,
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
 * Escalating fight structure. Total duration is the sum of these phases.
 *
 * Each duration is 70% of what it was: the fight was outstaying its welcome,
 * so every phase simply runs for less time. The pattern, the gaps and the
 * telegraph scales are untouched, so a phase is the same fight with fewer
 * repetitions of it — reading and dodging an individual laser is exactly as
 * generous as before.
 */
export const BOSS_PHASES: readonly BossPhaseDefinition[] = [
  {
    index: 0,
    label: 'PHASE 1',
    durationMs: 15_400,
    pattern: ['aimedLaser'],
    gapMs: 900,
    telegraphScale: 1.35,
  },
  {
    index: 1,
    label: 'PHASE 2',
    durationMs: 16_800,
    pattern: ['aimedLaser', 'laserWall', 'aimedLaser'],
    gapMs: 620,
    telegraphScale: 1.1,
  },
  {
    index: 2,
    label: 'PHASE 3',
    durationMs: 18_200,
    pattern: ['aimedLaser', 'laserWall', 'aimedLaser', 'laserWall'],
    gapMs: 480,
    telegraphScale: 0.95,
  },
  {
    index: 3,
    label: 'FINAL',
    durationMs: 9_800,
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
  /** The single source for what one emerald is worth. */
  emeraldScore: 100,
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
