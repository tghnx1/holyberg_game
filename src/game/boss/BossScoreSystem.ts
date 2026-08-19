import { BOSS_SCORING } from './bossConfig';

export interface BossScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  dodges: number;
  hits: number;
  survived: boolean;
}

export const initialBossScoreState = (): BossScoreState => ({
  score: 0,
  combo: 0,
  maxCombo: 0,
  dodges: 0,
  hits: 0,
  survived: false,
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
 * Fight is over. Survival and flawless bonuses are only awarded when the
 * player actually reached the end of the timer with HP left.
 */
export function applyFightEnd(state: BossScoreState, survived: boolean): BossScoreState {
  if (!survived) return { ...state, survived: false };
  const flawless = state.hits === 0;
  return {
    ...state,
    survived: true,
    score:
      state.score +
      BOSS_SCORING.survivalBonus +
      (flawless ? BOSS_SCORING.flawlessBonus : 0),
  };
}
