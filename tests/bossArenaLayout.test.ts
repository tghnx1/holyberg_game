import { describe, expect, it } from 'vitest';
import { getCoverImageLayout } from '../src/game/boss/bossArenaLayout';

describe('boss arena background layout', () => {
  const sourceWidth = 1672;
  const sourceHeight = 940;

  it.each([
    [1280, 720],
    [1558, 720],
    [844, 390],
    [1024, 768],
  ])('covers a %sx%s viewport with one proportional image', (width, height) => {
    const layout = getCoverImageLayout(width, height, sourceWidth, sourceHeight);
    expect(layout.x).toBe(width / 2);
    expect(layout.y).toBe(height / 2);
    expect(layout.displayWidth).toBeGreaterThanOrEqual(width);
    expect(layout.displayHeight).toBeGreaterThanOrEqual(height);
    expect(layout.displayWidth / layout.displayHeight).toBeCloseTo(sourceWidth / sourceHeight);
  });
});
