import type { CollectibleConfig } from './types';

export interface CollectibleReward {
  seconds: number;
  score: number;
  hasUsb: boolean;
}

export function applyCollectibleReward(
  seconds: number,
  hasUsb: boolean,
  collectible: CollectibleConfig,
): CollectibleReward {
  return {
    seconds: seconds + (collectible.timeBonus ?? 0),
    score: collectible.score,
    hasUsb: hasUsb || collectible.kind === 'usb',
  };
}

export function canFinishBerlin(hasUsb: boolean): boolean {
  void hasUsb;
  return true;
}
