import type { Lane } from './types';

export type BoothDeckSide = 'left' | 'right';

export function getDeckSideForLane(lane: Lane): BoothDeckSide {
  return lane < 2 ? 'left' : 'right';
}

export function getComboVisualIntensity(combo: number): number {
  return Math.min(1, Math.max(0, combo / 40));
}
