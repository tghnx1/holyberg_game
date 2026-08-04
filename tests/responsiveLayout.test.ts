import { describe, expect, it } from 'vitest';
import { calculateHudScale, calculateSafeMargin, clampTouchControlSize, createViewportInfo, isCompactLandscape, isPortrait } from '../src/game/responsive/ResponsiveLayout';

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
});
