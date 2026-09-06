/**
 * Theoretical maximum Boss score, read from the same deterministic fight
 * plan and scoring rules the real fight uses, so it can never drift from
 * them — the same idea as `level/berlin/berlinMaxScore.ts`.
 *
 * Every scheduled attack dodged back to back (an unbroken combo, scored
 * through the same multiplier tiers `BossScoreSystem` itself uses) plus
 * every emerald authored in every telegraph window, actually picked up.
 * `BOSS_SCORING.hitPenalty` never reduces this: a hit is a deviation from
 * the maximum, not a change to what the maximum is.
 */
import { BOSS_SCORING } from './bossConfig';
import { getBossMultiplier } from './BossScoreSystem';
import { getAuthoredEmeraldSpots } from './bossEmeraldSpots';
import { bossEmeraldWindowSceneKey, bossTelegraphWindowId } from './bossEmeraldWindows';
import { buildFightPlan } from './fightSequence';
import type { ArenaBounds } from './types';

/**
 * `bounds`/`seed` only affect each attack's own geometry (a laser wall's open
 * slot, an aimed laser's initial target) via `buildFightPlan`, never the
 * fight's attack *count* or pattern — those come only from `BOSS_PHASES` —
 * so the result is the same for any valid bounds/seed. Still taken as
 * parameters (mirroring `buildFightPlan`'s own signature) rather than
 * hardcoded, so a caller never has to fabricate a bounds/seed pair it
 * doesn't otherwise have.
 */
export function getBossMaxScore(sceneKey: string, bounds: ArenaBounds, seed: number): number {
  const plan = buildFightPlan(bounds, seed);
  let combo = 0;
  let maxScore = 0;
  for (const attack of plan.attacks) {
    combo += 1;
    maxScore += BOSS_SCORING.dodgeScore * getBossMultiplier(combo);
    const windowKey = bossEmeraldWindowSceneKey(sceneKey, bossTelegraphWindowId(attack));
    maxScore += getAuthoredEmeraldSpots(windowKey).length * BOSS_SCORING.emeraldScore;
  }
  return maxScore;
}
