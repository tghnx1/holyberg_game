import { EXCELLENT_WINDOW_MS, GOOD_WINDOW_MS, PERFECT_WINDOW_MS } from './constants';
import type { Judgement } from './types';

export function judgeTiming(deltaMs: number): Judgement | null {
  const distance = Math.abs(deltaMs);
  if (distance <= PERFECT_WINDOW_MS) return 'PERFECT';
  if (distance <= EXCELLENT_WINDOW_MS) return 'EXCELLENT';
  if (distance <= GOOD_WINDOW_MS) return 'GOOD';
  return null;
}
