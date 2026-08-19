import { RHYTHM_SCORE_CAP } from './constants';
import type { Judgement, ScoreState } from './types';

export function getMultiplier(combo: number): number {
  if (combo >= 50) return 4;
  if (combo >= 25) return 3;
  if (combo >= 10) return 2;
  return 1;
}

export function getJudgementBaseScore(judgement: Judgement): number {
  if (judgement === 'PERFECT') return 100;
  if (judgement === 'GOOD') return 70;
  if (judgement === 'OK') return 40;
  return 0;
}

export function getMaximumRawScore(noteCount: number): number {
  let maximum = 0;
  for (let combo = 1; combo <= noteCount; combo += 1) {
    maximum += getJudgementBaseScore('PERFECT') * getMultiplier(combo);
  }
  return maximum;
}

export function normalizeRhythmScore(rawScore: number, maximumRawScore: number): number {
  if (maximumRawScore <= 0) return 0;
  return Math.round(
    RHYTHM_SCORE_CAP * Math.min(1, Math.max(0, rawScore / maximumRawScore)),
  );
}

export const initialScoreState = (noteCount = 1): ScoreState => ({
  score: 0,
  rawScore: 0,
  maximumRawScore: getMaximumRawScore(noteCount),
  scorePenalty: 0,
  combo: 0,
  maxCombo: 0,
  perfect: 0,
  good: 0,
  ok: 0,
  miss: 0,
  badTap: 0,
});

export function getAwardedPoints(state: ScoreState, judgement: Judgement): number {
  if (judgement === 'MISS') return 0;
  const rawAward = getJudgementBaseScore(judgement) * getMultiplier(state.combo + 1);
  const projectedScore = Math.max(
    0,
    normalizeRhythmScore(state.rawScore + rawAward, state.maximumRawScore) - state.scorePenalty,
  );
  return Math.max(0, projectedScore - state.score);
}

export function applyJudgement(
  state: ScoreState,
  judgement: Judgement,
  scoringEnabled = true,
): ScoreState {
  if (judgement === 'MISS') {
    return {
      ...state,
      combo: 0,
      miss: state.miss + 1,
    };
  }

  const combo = scoringEnabled ? state.combo + 1 : state.combo;
  const rawAward = scoringEnabled
    ? getJudgementBaseScore(judgement) * getMultiplier(combo)
    : 0;
  const rawScore = state.rawScore + rawAward;
  return {
    ...state,
    score: scoringEnabled
      ? Math.max(
          0,
          normalizeRhythmScore(rawScore, state.maximumRawScore) - state.scorePenalty,
        )
      : state.score,
    rawScore,
    combo,
    maxCombo: scoringEnabled ? Math.max(state.maxCombo, combo) : state.maxCombo,
    perfect: state.perfect + (judgement === 'PERFECT' ? 1 : 0),
    good: state.good + (judgement === 'GOOD' ? 1 : 0),
    ok: state.ok + (judgement === 'OK' ? 1 : 0),
  };
}

export function calculateAccuracy(state: ScoreState): number {
  const total = state.perfect + state.good + state.ok + state.miss;
  const earned = state.perfect * 100 + state.good * 70 + state.ok * 40;
  return total === 0 ? 0 : earned / total;
}

export const combineScores = (berlinScore: number, rhythmScore: number): number =>
  berlinScore + rhythmScore;

/** Leaderboard total across all three levels. Level 3 is 0 until it is played. */
export const combineAllScores = (
  berlinScore: number,
  rhythmScore: number,
  bossScore = 0,
): number => combineScores(berlinScore, rhythmScore) + bossScore;

export function getPerformanceGrade(accuracy: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (accuracy >= 95) return 'S';
  if (accuracy >= 90) return 'A';
  if (accuracy >= 80) return 'B';
  if (accuracy >= 70) return 'C';
  return 'D';
}
