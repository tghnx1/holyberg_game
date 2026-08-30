import { BAD_TAP_SCORE_PENALTY, LANE_INPUT_COOLDOWN_MS, MASH_LOCK_MS, MASH_THRESHOLD, MASH_WINDOW_MS } from './constants';
import { normalizeRhythmScore } from './ScoreSystem';
import type { Lane, ScoreState } from './types';

/**
 * An empty press: costs points and drops the combo, but can never put the
 * player into a debt they cannot climb out of.
 *
 * `scorePenalty` is a running total of points actually deducted, and the
 * deduction is clamped to what has been earned so far — so it can never
 * exceed the earned score, and the moment the player hits another note their
 * score starts rising again. Before this clamp the penalty was unbounded:
 * enough bad taps (188 of them, against the 7500 score cap) pushed it past
 * anything the rest of the track could ever pay back, so `score` sat pinned
 * at 0 for the remainder of the run — a full perfect clear of every
 * remaining note still finished on 0. That is how the other two levels have
 * always behaved: Berlin takes `Math.min(penalty, score)` and the boss fight
 * takes `Math.max(0, score - penalty)`, both deducting from the current
 * score rather than accumulating a separate unbounded debt.
 */
export function applyBadTap(state: ScoreState): ScoreState {
  const earned = normalizeRhythmScore(state.rawScore, state.maximumRawScore);
  const deductible = Math.max(0, earned - state.scorePenalty);
  const scorePenalty = state.scorePenalty + Math.min(BAD_TAP_SCORE_PENALTY, deductible);
  return {
    ...state,
    score: Math.max(0, earned - scorePenalty),
    scorePenalty,
    combo: 0,
    badTap: state.badTap + 1,
  };
}

export class LaneInputGuard {
  private readonly laneTimes = [-Infinity, -Infinity, -Infinity, -Infinity];
  private readonly activePointers = new Set<number>();
  allowLane(lane: Lane, timeMs: number): boolean {
    if (timeMs - this.laneTimes[lane] < LANE_INPUT_COOLDOWN_MS) return false;
    this.laneTimes[lane] = timeMs;
    return true;
  }
  beginPointer(pointerId: number, lane: Lane, timeMs: number): boolean {
    if (this.activePointers.has(pointerId)) return false;
    this.activePointers.add(pointerId);
    return this.allowLane(lane, timeMs);
  }
  endPointer(pointerId: number): void { this.activePointers.delete(pointerId); }
  reset(): void { this.activePointers.clear(); this.laneTimes.fill(-Infinity); }
}

export class AntiMashSystem {
  private badTapTimes: number[] = [];
  private lockedUntil = 0;
  recordBadTap(timeMs: number): boolean {
    this.badTapTimes = this.badTapTimes.filter((timestamp) => timeMs - timestamp <= MASH_WINDOW_MS);
    this.badTapTimes.push(timeMs);
    if (this.badTapTimes.length >= MASH_THRESHOLD) {
      this.lockedUntil = Math.max(this.lockedUntil, timeMs + MASH_LOCK_MS);
      this.badTapTimes = [];
      return true;
    }
    return false;
  }
  isLocked(timeMs: number): boolean { return timeMs < this.lockedUntil; }
  reset(): void { this.badTapTimes = []; this.lockedUntil = 0; }
}
