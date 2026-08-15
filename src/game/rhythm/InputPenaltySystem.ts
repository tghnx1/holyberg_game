import { BAD_TAP_SCORE_PENALTY, LANE_INPUT_COOLDOWN_MS, MASH_LOCK_MS, MASH_THRESHOLD, MASH_WINDOW_MS } from './constants';
import { normalizeRhythmScore } from './ScoreSystem';
import type { Lane, ScoreState } from './types';

export function applyBadTap(state: ScoreState): ScoreState {
  const scorePenalty = state.scorePenalty + BAD_TAP_SCORE_PENALTY;
  return {
    ...state,
    score: Math.max(
      0,
      normalizeRhythmScore(state.rawScore, state.maximumRawScore) - scorePenalty,
    ),
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
