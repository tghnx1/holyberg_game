import { describe, expect, it } from 'vitest';
import {
  applyDodge,
  applyFightEnd,
  applyLaserHit,
  getBossMultiplier,
  initialBossScoreState,
} from '../src/game/boss/BossScoreSystem';
import { BOSS_SCORING } from '../src/game/boss/bossConfig';
import { combineAllScores, combineScores } from '../src/game/rhythm/ScoreSystem';

describe('boss scoring', () => {
  it('awards 100 per clean dodge before any combo tier is reached', () => {
    const state = applyDodge(initialBossScoreState());
    expect(state.score).toBe(100);
    expect(state.combo).toBe(1);
    expect(state.dodges).toBe(1);
  });

  it('escalates the multiplier with consecutive dodges', () => {
    expect(getBossMultiplier(1)).toBe(1);
    expect(getBossMultiplier(4)).toBe(2);
    expect(getBossMultiplier(8)).toBe(3);
    expect(getBossMultiplier(12)).toBe(4);
    expect(getBossMultiplier(99)).toBe(4);

    let state = initialBossScoreState();
    for (let index = 0; index < 4; index += 1) state = applyDodge(state);
    // Three dodges at x1, the fourth crosses into the x2 tier.
    expect(state.score).toBe(300 + 200);
    expect(state.maxCombo).toBe(4);
  });

  it('penalises a hit by 500 and resets the combo but never goes negative', () => {
    let state = initialBossScoreState();
    for (let index = 0; index < 6; index += 1) state = applyDodge(state);
    const beforeHit = state.score;
    state = applyLaserHit(state);
    expect(state.score).toBe(Math.max(0, beforeHit - BOSS_SCORING.hitPenalty));
    expect(state.combo).toBe(0);
    expect(state.hits).toBe(1);
    expect(state.maxCombo).toBe(6);

    expect(applyLaserHit(initialBossScoreState()).score).toBe(0);
  });

  it('adds the survival bonus, and the flawless bonus only with zero hits', () => {
    const clean = applyFightEnd(applyDodge(initialBossScoreState()), true);
    expect(clean.score).toBe(100 + 2000 + 5000);
    expect(clean.survived).toBe(true);

    const hurt = applyFightEnd(applyLaserHit(applyDodge(initialBossScoreState())), true);
    expect(hurt.score).toBe(2000);
  });

  it('awards no end bonuses when the player is downed', () => {
    const downed = applyFightEnd(applyDodge(initialBossScoreState()), false);
    expect(downed.score).toBe(100);
    expect(downed.survived).toBe(false);
  });

  it('folds the boss score into the leaderboard total without changing levels 1-2', () => {
    expect(combineAllScores(7430, 7500)).toBe(combineScores(7430, 7500));
    expect(combineAllScores(7430, 7500, 3200)).toBe(18_130);
  });
});
