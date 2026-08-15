import { describe, expect, it } from 'vitest';
import { GROUND_Y, WORLD_WIDTH } from '../src/game/constants';
import {
  getStreetGroundAssetUrls,
  getStreetGroundPlacements,
  STREET_GROUND_CHUNK_WIDTH,
  STREET_GROUND_CROP_HEIGHT,
  STREET_GROUND_CROP_TOP,
  STREET_GROUND_SOURCE_HEIGHT,
  STREET_GROUND_SOURCE_WIDTH,
  STREET_GROUND_SURFACE_OFFSET,
  STREET_GROUND_SURFACE_SOURCE_Y,
  STREET_GROUND_VISIBLE_TOP_OFFSET,
  STREET_GROUND_VISIBLE_TOP_SOURCE_Y,
} from '../src/game/level/berlin/streetGroundLayout';

describe('Berlin street-ground layout', () => {
  it('removes the transparent source top and aligns the pavement with physics ground', () => {
    const [first] = getStreetGroundPlacements(WORLD_WIDTH, GROUND_Y);

    expect(STREET_GROUND_CROP_TOP).toBe(598);
    expect(STREET_GROUND_CROP_HEIGHT).toBe(STREET_GROUND_SOURCE_HEIGHT - STREET_GROUND_CROP_TOP);
    expect(STREET_GROUND_SURFACE_OFFSET).toBe(
      STREET_GROUND_SURFACE_SOURCE_Y - STREET_GROUND_CROP_TOP,
    );
    expect(first.topY + STREET_GROUND_SURFACE_OFFSET).toBe(GROUND_Y);
    expect(first.surfaceY).toBe(GROUND_Y);
  });

  it('keeps the decorative pavement lip above the physical contact line', () => {
    const [first] = getStreetGroundPlacements(WORLD_WIDTH, GROUND_Y);

    expect(STREET_GROUND_VISIBLE_TOP_OFFSET).toBe(
      STREET_GROUND_VISIBLE_TOP_SOURCE_Y - STREET_GROUND_CROP_TOP,
    );
    expect(first.visibleTopY).toBe(GROUND_Y - 13);
    expect(first.surfaceY - first.visibleTopY).toBe(13);
  });

  it('reassembles the entire authored strip before repeating it', () => {
    const placements = getStreetGroundPlacements(WORLD_WIDTH, GROUND_Y);
    const sourceChunkCount = Math.ceil(STREET_GROUND_SOURCE_WIDTH / STREET_GROUND_CHUNK_WIDTH);

    expect(placements.slice(0, sourceChunkCount).map(({ x }) => x)).toEqual([
      0, 3000, 6000, 9000, 12000,
    ]);
    expect(placements[sourceChunkCount].x).toBe(STREET_GROUND_SOURCE_WIDTH);
    expect(placements[sourceChunkCount].textureKey).toBe(placements[0].textureKey);
  });

  it('uses one world unit per source pixel and covers the complete level', () => {
    const placements = getStreetGroundPlacements(WORLD_WIDTH, GROUND_Y);

    expect(placements.every(({ width }) => width <= STREET_GROUND_CHUNK_WIDTH)).toBe(true);
    expect(placements.every(({ height }) => height === STREET_GROUND_CROP_HEIGHT)).toBe(true);
    const last = placements.at(-1);
    expect(last).toBeDefined();
    expect(last!.x + last!.width).toBeGreaterThanOrEqual(WORLD_WIDTH);
  });

  it('loads one generated texture per source chunk', () => {
    const urls = getStreetGroundAssetUrls();

    expect(urls).toHaveLength(Math.ceil(STREET_GROUND_SOURCE_WIDTH / STREET_GROUND_CHUNK_WIDTH));
    expect(urls[0]).toEqual({
      key: 'berlin-concrete-strip-0',
      url: 'assets/backgrounds/generated/concrete-strip-0.webp',
    });
    expect(new Set(urls.map(({ key }) => key)).size).toBe(urls.length);
  });
});
