import { BOSS_SCORING } from './bossConfig';

export interface BossScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  dodges: number;
  hits: number;
  /** Emeralds picked up across the whole fight. */
  emeralds: number;
  /** The part of `score` that came from emeralds, kept for the result screen. */
  emeraldScore: number;
  finished: boolean;
}

export const initialBossScoreState = (): BossScoreState => ({
  score: 0,
  combo: 0,
  maxCombo: 0,
  dodges: 0,
  hits: 0,
  emeralds: 0,
  emeraldScore: 0,
  finished: false,
});

/** Combo multiplier for the dodge that is about to be scored. */
export function getBossMultiplier(combo: number): number {
  for (const tier of BOSS_SCORING.multiplierTiers) {
    if (combo >= tier.combo) return tier.multiplier;
  }
  return 1;
}

/**
 * An attack finished without touching the player. Score is awarded per attack
 * resolved, never per unit of time survived, so it stays event-deterministic.
 */
export function applyDodge(state: BossScoreState): BossScoreState {
  const combo = state.combo + 1;
  return {
    ...state,
    score: state.score + BOSS_SCORING.dodgeScore * getBossMultiplier(combo),
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
    dodges: state.dodges + 1,
  };
}

/**
 * An emerald was run through during a telegraph.
 *
 * Flat, and outside the dodge combo: emeralds are a greed mechanic, and
 * multiplying them by a dodge streak would make the safest possible fight also
 * the highest scoring one. `emeraldScore` is tracked alongside the running
 * total so the result screen can show what the greed was worth.
 */
export function applyEmeraldPickup(state: BossScoreState): BossScoreState {
  return {
    ...state,
    score: state.score + BOSS_SCORING.emeraldScore,
    emeralds: state.emeralds + 1,
    emeraldScore: state.emeraldScore + BOSS_SCORING.emeraldScore,
  };
}

/** A laser connected: flat penalty and the combo resets. Score never goes negative. */
export function applyLaserHit(state: BossScoreState): BossScoreState {
  return {
    ...state,
    score: Math.max(0, state.score - BOSS_SCORING.hitPenalty),
    combo: 0,
    hits: state.hits + 1,
  };
}

/**
 * Fight is over.
 *
 * Marks the state finished and nothing else. `score` here must equal exactly
 * what the HUD has already shown the player for the whole fight — adding a
 * bonus at this point (as this used to, unconditionally) would change the
 * number silently at the one moment the player is no longer watching it
 * update live, which reads as the score having been wrong the entire time.
 */
export function applyFightEnd(state: BossScoreState): BossScoreState {
  return { ...state, finished: true };
}
