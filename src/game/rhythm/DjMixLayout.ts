import type { RhythmAction } from './types';

export const DJ_GAMEPLAY_TOP_Y = 548;
export const DJ_GAMEPLAY_BOTTOM_Y = 720;
export const DJ_STRIP_WIDTH = 1080;
export const DJ_STRIP_HEIGHT = 158;

export interface DjMixLayout {
  centerX: number;
  gameplayTop: number;
  gameplayBottom: number;
  leftMarkerX: number;
  rightMarkerX: number;
  stripCenterY: number;
  stripWidth: number;
  stripHeight: number;
}
export function getDjMixLayout(centerX: number): DjMixLayout {
  return {
    centerX,
    gameplayTop: DJ_GAMEPLAY_TOP_Y,
    gameplayBottom: DJ_GAMEPLAY_BOTTOM_Y,
    leftMarkerX: centerX - 330,
    rightMarkerX: centerX + 330,
    stripCenterY: 630,
    stripWidth: DJ_STRIP_WIDTH,
    stripHeight: DJ_STRIP_HEIGHT,
  };
}

export function mapPointToTapAction(
  x: number,
  y: number,
  centerX: number,
  logicalHeight = DJ_GAMEPLAY_BOTTOM_Y,
): Extract<RhythmAction, 'tapLeft' | 'tapRight'> | null {
  if (y < DJ_GAMEPLAY_TOP_Y || y > logicalHeight) return null;
  return x < centerX ? 'tapLeft' : 'tapRight';
}
