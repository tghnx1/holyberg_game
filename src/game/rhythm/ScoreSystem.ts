import { CROWD_ENERGY_MAX, CROWD_ENERGY_MIN, INITIAL_ENERGY } from './constants';
import type { Judgement, ScoreState } from './types';

export const initialScoreState = (): ScoreState => ({ score: 0, combo: 0, maxCombo: 0, perfect: 0, excellent: 0, good: 0, miss: 0, badTap: 0, energy: INITIAL_ENERGY });

export function getMultiplier(combo: number): number {
  if (combo >= 50) return 4;
  if (combo >= 25) return 3;
  if (combo >= 10) return 2;
  return 1;
}

export function getJudgementBaseScore(judgement: Judgement): number {
  if (judgement === 'PERFECT') return 150;
  if (judgement === 'EXCELLENT') return 100;
  if (judgement === 'GOOD') return 50;
  return 0;
}

export function getAwardedPoints(state: ScoreState, judgement: Judgement): number {
  const scoringCombo = judgement === 'MISS' ? 0 : state.combo + 1;
  return getJudgementBaseScore(judgement) * getMultiplier(scoringCombo);
}

export function applyJudgement(state: ScoreState, judgement: Judgement, protectEnergy = false, scoringEnabled = true): ScoreState {
  if (judgement === 'MISS') {
    return { ...state, combo: 0, miss: state.miss + 1, energy: protectEnergy ? state.energy : Math.max(CROWD_ENERGY_MIN, state.energy - 3) };
  }
  const combo = scoringEnabled ? state.combo + 1 : state.combo;
  const energyGain = judgement === 'GOOD' ? 1 : 2;
  return {
    ...state,
    score: state.score + (scoringEnabled ? getAwardedPoints(state, judgement) : 0),
    combo,
    maxCombo: scoringEnabled ? Math.max(state.maxCombo, combo) : state.maxCombo,
    perfect: state.perfect + (judgement === 'PERFECT' ? 1 : 0),
    excellent: state.excellent + (judgement === 'EXCELLENT' ? 1 : 0),
    good: state.good + (judgement === 'GOOD' ? 1 : 0),
    energy: Math.min(CROWD_ENERGY_MAX, state.energy + energyGain),
  };
}

export function calculateAccuracy(state: ScoreState): number {
  const total = state.perfect + state.excellent + state.good + state.miss;
  return total === 0 ? 0 : ((state.perfect + state.excellent * 0.8 + state.good * 0.5) / total) * 100;
}

export const combineScores = (berlinScore: number, rhythmScore: number): number => berlinScore + rhythmScore;

export function getPerformanceGrade(accuracy: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (accuracy >= 90) return 'S';
  if (accuracy >= 75) return 'A';
  if (accuracy >= 55) return 'B';
  if (accuracy >= 35) return 'C';
  return 'D';
}
