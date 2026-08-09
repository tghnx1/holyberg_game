import { describe, expect, it } from 'vitest';
import {
  REFERENCE_HOUSE_ASPECT_RATIO,
  REFERENCE_HOUSE_TARGET_HEIGHT,
  REFERENCE_HOUSE_TARGET_WIDTH,
  REFERENCE_SKY_WIDTH,
  backgroundLayout,
  getDisplaySize,
  getSkyDisplayWidth,
} from '../src/game/level/berlin/backgroundLayout';
import { calculateExpandedLogicalSize } from '../src/game/responsive/ResponsiveLayout';

describe('Berlin background layout invariants', () => {
  it('preserves the current iPhone 13 reference composition', () => {
    const camera = calculateExpandedLogicalSize(844, 390);
    const house = getDisplaySize(
      backgroundLayout.houses.targetHeight,
      backgroundLayout.houses.aspectRatio,
    );

    expect(camera.width).toBeCloseTo(1558.1538461538462, 9);
    expect(camera.height).toBe(720);
    expect(REFERENCE_SKY_WIDTH).toBe(1664);
    expect(getSkyDisplayWidth(camera.width)).toBe(1664);
    expect(REFERENCE_HOUSE_TARGET_HEIGHT).toBeCloseTo(752.959935, 9);
    expect(REFERENCE_HOUSE_TARGET_WIDTH).toBeCloseTo(2259.431424, 9);
    expect(house.height).toBeCloseTo(752.959935, 9);
    expect(house.width).toBeCloseTo(2259.431424, 9);
    expect(backgroundLayout.city.targetHeight).toBe(640);
    expect(backgroundLayout.railwaySection.targetHeight).toBe(650);
  });

  it('expands only sky coverage for a wider landscape camera', () => {
    const camera = calculateExpandedLogicalSize(2560, 1080);
    const referenceHouse = getDisplaySize(
      REFERENCE_HOUSE_TARGET_HEIGHT,
      REFERENCE_HOUSE_ASPECT_RATIO,
    );

    expect(getSkyDisplayWidth(camera.width)).toBeGreaterThanOrEqual(camera.width);
    expect(getSkyDisplayWidth(camera.width)).toBe(1707);
    expect(referenceHouse.width).toBeCloseTo(REFERENCE_HOUSE_TARGET_WIDTH, 9);
    expect(referenceHouse.height).toBeCloseTo(REFERENCE_HOUSE_TARGET_HEIGHT, 9);
  });

  it('keeps a narrower landscape at the same world scale without sky gaps', () => {
    const camera = calculateExpandedLogicalSize(1024, 768);

    expect(camera).toEqual({ width: 960, height: 720 });
    expect(getSkyDisplayWidth(camera.width)).toBe(REFERENCE_SKY_WIDTH);
    expect(getSkyDisplayWidth(camera.width)).toBeGreaterThanOrEqual(camera.width);
  });

  it('keeps canonical world dimensions independent of raster quality tier', () => {
    const rasterVariants = [
      { tier: 'mobile', width: 2048, height: 683 },
      { tier: 'medium', width: 3072, height: 1024 },
      { tier: 'desktop', width: 4096, height: 1365 },
    ] as const;

    const worldSizes = rasterVariants.map(({ width, height }) => {
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      return getDisplaySize(REFERENCE_HOUSE_TARGET_HEIGHT, REFERENCE_HOUSE_ASPECT_RATIO);
    });

    expect(worldSizes).toHaveLength(3);
    for (const size of worldSizes) {
      expect(size.width).toBeCloseTo(REFERENCE_HOUSE_TARGET_WIDTH, 9);
      expect(size.height).toBeCloseTo(REFERENCE_HOUSE_TARGET_HEIGHT, 9);
    }
    expect(new Set(worldSizes.map((size) => JSON.stringify(size))).size).toBe(1);
  });
});
