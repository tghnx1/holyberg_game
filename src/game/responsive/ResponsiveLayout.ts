import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../constants';
import { COMPACT_LANDSCAPE_HEIGHT, COMPACT_SAFE_MARGIN, DESKTOP_SAFE_MARGIN, MAX_TOUCH_TARGET, MIN_TOUCH_TARGET } from './constants';
import type { ViewportInfo } from './ViewportInfo';

export function isPortrait(width: number, height: number): boolean { return height > width; }
export function isCompactLandscape(width: number, height: number): boolean { return width >= height && height <= COMPACT_LANDSCAPE_HEIGHT; }
export function calculateSafeMargin(compact: boolean): number { return compact ? COMPACT_SAFE_MARGIN : DESKTOP_SAFE_MARGIN; }
export function calculateHudScale(compact: boolean): number { return compact ? 0.82 : 1; }
export function clampTouchControlSize(value: number): number { return Math.min(MAX_TOUCH_TARGET, Math.max(MIN_TOUCH_TARGET, value)); }

export function createViewportInfo(width: number, height: number, touchOriented = false): ViewportInfo {
  const compactLandscape = isCompactLandscape(width, height);
  return {
    logicalWidth: DESIGN_WIDTH,
    logicalHeight: DESIGN_HEIGHT,
    physicalWidth: width,
    physicalHeight: height,
    aspectRatio: width / Math.max(1, height),
    portrait: isPortrait(width, height),
    compactLandscape,
    touchOriented,
    safeMargin: calculateSafeMargin(compactLandscape),
    hudScale: calculateHudScale(compactLandscape),
    touchControlSize: clampTouchControlSize(compactLandscape ? 86 : 112),
  };
}

export function getViewportInfo(scale: Phaser.Scale.ScaleManager): ViewportInfo {
  const size = scale.parentSize;
  const touch = scale.game.device.input.touch;
  return createViewportInfo(size.width, size.height, touch);
}
