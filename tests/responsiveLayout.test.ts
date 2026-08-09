import { describe, expect, it } from 'vitest';
import {
  calculateExpandedLogicalSize,
  calculateHudScale,
  calculateSafeMargin,
  clampTouchControlSize,
  createViewportInfo,
  isCompactLandscape,
  isPortrait,
} from '../src/game/responsive/ResponsiveLayout';

describe('responsive layout', () => {
  it('detects portrait and landscape', () => {
    expect(isPortrait(390, 844)).toBe(true);
    expect(isPortrait(844, 390)).toBe(false);
  });
  it('detects compact landscape', () => {
    expect(isCompactLandscape(844, 390)).toBe(true);
    expect(isCompactLandscape(1920, 1080)).toBe(false);
  });
  it('calculates compact HUD scale and margins', () => {
    expect(calculateHudScale(true)).toBeLessThan(calculateHudScale(false));
    expect(calculateSafeMargin(true)).toBeLessThan(calculateSafeMargin(false));
  });
  it('clamps touch targets to practical bounds', () => {
    expect(clampTouchControlSize(20)).toBe(80);
    expect(clampTouchControlSize(500)).toBe(118);
  });
  it('keeps the logical design resolution', () => {
    const viewport = createViewportInfo(812, 375, true);
    expect([viewport.logicalWidth, viewport.logicalHeight]).toEqual([1280, 720]);
    expect(viewport.compactLandscape).toBe(true);
    expect(viewport.touchOriented).toBe(true);
  });
  it('preserves the 720-unit world height on the iPhone 13 reference viewport', () => {
    const logical = calculateExpandedLogicalSize(844, 390);

    expect(logical.width).toBeCloseTo(1558.1538461538462, 9);
    expect(logical.height).toBe(720);
  });
  it('reveals more or less world horizontally without scaling landscape height', () => {
    const narrower = calculateExpandedLogicalSize(1024, 768);
    const wider = calculateExpandedLogicalSize(2560, 1080);

    expect(narrower).toEqual({ width: 960, height: 720 });
    expect(wider.width).toBeCloseTo(1706.6666666666667, 9);
    expect(wider.height).toBe(720);
  });
});
