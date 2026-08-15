import { GOOD_WINDOW_MS, OK_WINDOW_MS, PERFECT_WINDOW_MS } from './constants';
import type { Judgement } from './types';

export function judgeTiming(deltaMs: number): Exclude<Judgement, 'MISS'> | null {
  const distance = Math.abs(deltaMs);
  if (distance <= PERFECT_WINDOW_MS) return 'PERFECT';
  if (distance <= GOOD_WINDOW_MS) return 'GOOD';
  if (distance <= OK_WINDOW_MS) return 'OK';
  return null;
}
