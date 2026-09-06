import { describe, expect, it } from 'vitest';
import {
  applyDodge,
  applyEmeraldPickup,
  applyFightEnd,
  applyLaserHit,
  getBossMultiplier,
  initialBossScoreState,
  type BossScoreState,
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

  it('marks the fight finished without changing the score, so it never jumps at the end', () => {
    const beforeEnd = applyDodge(initialBossScoreState());
    const clean = applyFightEnd(beforeEnd);
    expect(clean.score).toBe(beforeEnd.score);
    expect(clean.finished).toBe(true);

    const hurtBeforeEnd = applyLaserHit(applyDodge(initialBossScoreState()));
    const hurt = applyFightEnd(hurtBeforeEnd);
    expect(hurt.score).toBe(hurtBeforeEnd.score);
  });

  it('always reaches the end: being hit costs points, never the run, and ending adds nothing', () => {
    // There is no downed branch to award nothing, because there is no downing.
    let state = initialBossScoreState();
    for (let index = 0; index < 20; index += 1) state = applyLaserHit(state);
    expect(state.hits).toBe(20);
    expect(state.score).toBe(0);

    const ended = applyFightEnd(state);
    expect(ended.finished).toBe(true);
    expect(ended.score).toBe(0);
  });

  it('regression: a score of 1000 visible on the HUD at fight end stays 1000, not silently bumped', () => {
    // Whatever combination of dodges/emeralds/hits produced this running
    // total, it is exactly what the HUD has already shown the player.
    const state: BossScoreState = { ...initialBossScoreState(), score: 1000 };

    const ended = applyFightEnd(state);

    expect(ended.score).toBe(1000);
    expect(ended.finished).toBe(true);
  });

  it('awards a flat emerald value and tracks it separately from the total', () => {
    let state = applyDodge(initialBossScoreState());
    state = applyEmeraldPickup(state);
    state = applyEmeraldPickup(state);

    expect(state.emeralds).toBe(2);
    expect(state.emeraldScore).toBe(BOSS_SCORING.emeraldScore * 2);
    expect(state.score).toBe(100 + BOSS_SCORING.emeraldScore * 2);
    // Emeralds are outside the dodge economy: no combo, no multiplier.
    expect(state.combo).toBe(1);
  });

  it('does not let a dodge combo multiply emerald value', () => {
    let combo = initialBossScoreState();
    for (let index = 0; index < 12; index += 1) combo = applyDodge(combo);
    const before = combo.score;
    expect(getBossMultiplier(combo.combo)).toBe(4);
    expect(applyEmeraldPickup(combo).score).toBe(before + BOSS_SCORING.emeraldScore);
  });

  it('folds the boss score into the leaderboard total without changing levels 1-2', () => {
    expect(combineAllScores(7430, 7500)).toBe(combineScores(7430, 7500));
    expect(combineAllScores(7430, 7500, 3200)).toBe(18_130);
  });
});
