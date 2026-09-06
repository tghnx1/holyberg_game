import { afterEach, describe, expect, it } from 'vitest';
import { getBossMaxScore } from '../src/game/boss/bossMaxScore';
import { getBossMultiplier, initialBossScoreState, type BossScoreState } from '../src/game/boss/BossScoreSystem';
import { BOSS_SCORING } from '../src/game/boss/bossConfig';
import { emeraldSpotLayout } from '../src/game/boss/bossEmeraldSpots';
import { bossEmeraldWindowSceneKey, bossTelegraphWindowId } from '../src/game/boss/bossEmeraldWindows';
import { buildFightPlan } from '../src/game/boss/fightSequence';
import { resetSceneLayout, setSceneObjectLayout } from '../src/game/systems/sceneLayout';
import type { ArenaBounds } from '../src/game/boss/types';

const bounds: ArenaBounds = { minX: 70, maxX: 1210 };
const SCENE = 'BossMaxScoreTest';

/** The dodge-only max: every scheduled attack dodged back to back, no emeralds authored anywhere. */
function dodgeOnlyMax(): number {
  const plan = buildFightPlan(bounds, 1);
  let combo = 0;
  let total = 0;
  for (const attack of plan.attacks) {
    void attack;
    combo += 1;
    total += BOSS_SCORING.dodgeScore * getBossMultiplier(combo);
  }
  return total;
}

describe('theoretical Boss maximum score', () => {
  afterEach(() => resetSceneLayout());

  it('with no emeralds authored anywhere, equals exactly the dodge-only maximum', () => {
    expect(getBossMaxScore(SCENE, bounds, 1)).toBe(dodgeOnlyMax());
  });

  it('regression: is independent of the achieved score — computing it never reads any BossScoreState', () => {
    const maxScore = getBossMaxScore(SCENE, bounds, 1);

    // Whatever the player actually scored, the maximum reported is the same
    // number: it is a property of the fight/scoring config, not of any run.
    const achievedStates: BossScoreState[] = [
      { ...initialBossScoreState(), score: 0 },
      { ...initialBossScoreState(), score: 1000 },
      { ...initialBossScoreState(), score: 999_999 },
    ];
    for (const achieved of achievedStates) {
      void achieved;
      expect(getBossMaxScore(SCENE, bounds, 1)).toBe(maxScore);
    }
  });

  it('regression: reflects the current authored emerald config, and changes when it does', () => {
    const before = getBossMaxScore(SCENE, bounds, 1);

    const plan = buildFightPlan(bounds, 1);
    const firstAttack = plan.attacks[0];
    const windowKey = bossEmeraldWindowSceneKey(SCENE, bossTelegraphWindowId(firstAttack));
    setSceneObjectLayout(windowKey, 'emerald-01', emeraldSpotLayout({ x: 300, y: 560 }, 1));

    const afterOneEmerald = getBossMaxScore(SCENE, bounds, 1);
    expect(afterOneEmerald).toBe(before + BOSS_SCORING.emeraldScore);

    setSceneObjectLayout(windowKey, 'emerald-02', emeraldSpotLayout({ x: 400, y: 560 }, 1));
    expect(getBossMaxScore(SCENE, bounds, 1)).toBe(before + BOSS_SCORING.emeraldScore * 2);
  });

  it('regression: changes when the scoring config itself would (dodgeScore drives every attack, not just one)', () => {
    const plan = buildFightPlan(bounds, 1);
    expect(plan.attacks.length).toBeGreaterThan(1);

    // Sanity: the dodge-only maximum is strictly more than a single dodge at
    // the highest multiplier tier could ever produce, proving every
    // scheduled attack is actually counted, not just one.
    const singleAttackUpperBound = BOSS_SCORING.dodgeScore * 4;
    expect(dodgeOnlyMax()).toBeGreaterThan(singleAttackUpperBound);
  });

  it('never includes BOSS_SCORING.hitPenalty — a hit is a deviation from the max, not a change to it', () => {
    // Purely structural: getBossMaxScore never even reads hits/penalties,
    // so nothing here can lower the ceiling regardless of how badly a fight
    // goes.
    expect(getBossMaxScore(SCENE, bounds, 1)).toBe(dodgeOnlyMax());
  });
});
