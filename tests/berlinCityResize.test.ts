import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {} }));
import { getCityScrollFactor } from '../src/game/level/berlinLevel';
import { backgroundLayout, getDisplaySize } from '../src/game/level/berlin/backgroundLayout';
import { WORLD_WIDTH } from '../src/game/constants';

describe('Berlin skyline viewport coverage', () => {
  it.each([960, 1280, 1558.1538461538462, 1707])('covers both world endpoints at logical width %i', (width) => {
    // Given the authored skyline at its canonical display size.
    const city = getDisplaySize(backgroundLayout.city.targetHeight, backgroundLayout.city.aspectRatio);
    // When its factor is resolved for the live camera width.
    const factor = getCityScrollFactor(city.width, width);
    // Then the skyline spans the viewport at either end of camera travel.
    expect(city.width).toBeGreaterThanOrEqual(width);
    expect(city.width - (WORLD_WIDTH - width) * factor).toBeCloseTo(width);
  });
});
