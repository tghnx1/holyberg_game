/**
 * Builds the whole fight up front as a deterministic list of scheduled attacks.
 *
 * Two properties are guaranteed by construction rather than by tuning luck:
 *
 * 1. Attacks never overlap. Each one is scheduled after the previous attack's
 *    recovery plus the phase gap, so at most one attack can damage the player
 *    at any instant and no combination can be unavoidable.
 * 2. Every attack is escapable. A `laserWall` always leaves exactly one full
 *    slot open, and a `sweepLaser` crosses the arena slower than the player
 *    runs, so it can always be outrun to the far side.
 */
import {
  ATTACK_SHAPES,
  ATTACK_TIMINGS,
  BOSS_PHASES,
  BOSS_PLAYER,
  MINIMUM_TELEGRAPH_MS,
} from './bossConfig';
import { getAttackDurationMs } from './attackRuntime';
import type {
  ArenaBounds,
  AttackParams,
  AttackTiming,
  BossAttackType,
  BossPhaseDefinition,
  ScheduledAttack,
  SweepDirection,
} from './types';

/**
 * Small deterministic PRNG (mulberry32). Seeded so a given fight is
 * reproducible, which keeps scoring auditable and tests stable.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export const getArenaWidth = (bounds: ArenaBounds): number => bounds.maxX - bounds.minX;

/** How long a sweep needs to cross the arena at its configured speed. */
export const getSweepTravelMs = (bounds: ArenaBounds, speedPxPerSecond: number): number =>
  Math.round((getArenaWidth(bounds) / speedPxPerSecond) * 1000);

/**
 * Splits the arena into `columnCount + 1` equal slots and opens exactly one of
 * them, so there is always a readable gap wide enough to stand in.
 */
export function buildLaserWall(
  bounds: ArenaBounds,
  random: () => number,
): Extract<AttackParams, { type: 'laserWall' }> {
  const { columnCount, halfWidthPx, safeGapHalfWidthPx } = ATTACK_SHAPES.laserWall;
  const slotCount = columnCount + 1;
  const slotWidth = getArenaWidth(bounds) / slotCount;
  const openSlot = Math.min(slotCount - 1, Math.floor(random() * slotCount));
  const slotCenter = (slot: number): number => bounds.minX + slotWidth * (slot + 0.5);
  const columnCenters: number[] = [];
  for (let slot = 0; slot < slotCount; slot += 1) {
    if (slot !== openSlot) columnCenters.push(slotCenter(slot));
  }
  return {
    type: 'laserWall',
    columnCenters,
    halfWidth: halfWidthPx,
    safeGapCenterX: slotCenter(openSlot),
    // Never claim a gap wider than the slot actually is.
    safeGapHalfWidth: Math.min(safeGapHalfWidthPx, slotWidth / 2),
  };
}

function buildParams(
  type: BossAttackType,
  bounds: ArenaBounds,
  random: () => number,
): AttackParams {
  if (type === 'aimedLaser') {
    // targetX is a placeholder: it is resampled from the live player position
    // the moment the telegraph starts.
    return { type: 'aimedLaser', targetX: 0, halfWidth: ATTACK_SHAPES.aimedLaser.halfWidthPx };
  }
  if (type === 'sweepLaser') {
    const direction: SweepDirection = random() < 0.5 ? 'leftToRight' : 'rightToLeft';
    return {
      type: 'sweepLaser',
      direction,
      halfWidth: ATTACK_SHAPES.sweepLaser.halfWidthPx,
      speed: ATTACK_SHAPES.sweepLaser.speedPxPerSecond,
    };
  }
  return buildLaserWall(bounds, random);
}

function buildTiming(
  type: BossAttackType,
  phase: BossPhaseDefinition,
  bounds: ArenaBounds,
): AttackTiming {
  const base = ATTACK_TIMINGS[type];
  return {
    telegraphMs: Math.max(
      MINIMUM_TELEGRAPH_MS,
      Math.round(base.telegraphMs * phase.telegraphScale),
    ),
    // A sweep is damaging for exactly as long as it takes to cross the arena,
    // so its on-screen speed always matches ATTACK_SHAPES.sweepLaser.
    activeMs:
      type === 'sweepLaser'
        ? getSweepTravelMs(bounds, ATTACK_SHAPES.sweepLaser.speedPxPerSecond)
        : base.activeMs,
    recoveryMs: base.recoveryMs,
  };
}

export interface FightPlan {
  attacks: readonly ScheduledAttack[];
  totalDurationMs: number;
}

/**
 * Lays out every attack of the fight on the fight clock.
 *
 * A phase stops scheduling once the next attack would not finish inside the
 * phase window, so phases never bleed into one another.
 */
export function buildFightPlan(
  bounds: ArenaBounds,
  seed = 1,
  phases: readonly BossPhaseDefinition[] = BOSS_PHASES,
): FightPlan {
  const random = createRandom(seed);
  const attacks: ScheduledAttack[] = [];
  let cursorMs = 0;
  let id = 0;

  for (const phase of phases) {
    const phaseEndMs = cursorMs + phase.durationMs;
    let patternIndex = 0;
    // Ease into each phase so a new pattern never opens mid-reaction.
    cursorMs += phase.gapMs;
    for (;;) {
      const type = phase.pattern[patternIndex % phase.pattern.length];
      const timing = buildTiming(type, phase, bounds);
      const attack: ScheduledAttack = {
        id,
        type,
        phaseIndex: phase.index,
        startMs: cursorMs,
        timing,
        params: buildParams(type, bounds, random),
      };
      const endMs = cursorMs + getAttackDurationMs(attack);
      if (endMs > phaseEndMs) break;
      attacks.push(attack);
      id += 1;
      patternIndex += 1;
      cursorMs = endMs + phase.gapMs;
    }
    cursorMs = phaseEndMs;
  }

  return { attacks, totalDurationMs: cursorMs };
}

/** Index of the phase running at `nowMs`, clamped to the last phase. */
export function getPhaseAt(
  nowMs: number,
  phases: readonly BossPhaseDefinition[] = BOSS_PHASES,
): BossPhaseDefinition {
  let elapsed = 0;
  for (const phase of phases) {
    elapsed += phase.durationMs;
    if (nowMs < elapsed) return phase;
  }
  return phases[phases.length - 1];
}

/** True when a sweep can be outrun, i.e. the fight is fair by configuration. */
export const isSweepOutrunnable = (
  speedPxPerSecond = ATTACK_SHAPES.sweepLaser.speedPxPerSecond,
  playerSpeed = BOSS_PLAYER.moveSpeed,
): boolean => speedPxPerSecond < playerSpeed;
