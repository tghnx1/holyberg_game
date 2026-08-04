import { END_GRACE_MS, MISS_WINDOW_MS } from './constants';
import type { ChartNote } from './types';

export function getChartEndTimeMs(durationMs: number, notes: readonly ChartNote[]): number {
  const lastNote = notes.length === 0 ? 0 : Math.max(...notes.map((note) => note.timeMs));
  return Math.max(durationMs, lastNote + MISS_WINDOW_MS);
}

export function shouldCompleteChart(currentTimeMs: number, chartEndTimeMs: number): boolean {
  return currentTimeMs >= chartEndTimeMs + END_GRACE_MS;
}

export class CompletionGate {
  private completed = false;
  tryComplete(ready: boolean, callback: () => void): boolean {
    if (!ready || this.completed) return false;
    this.completed = true;
    callback();
    return true;
  }
}
