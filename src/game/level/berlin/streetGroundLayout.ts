import streetGroundAsset from '../../assets/berlinStreetGround.json';

const GENERATED_ASSET_DIRECTORY = 'assets/backgrounds/generated';

export interface StreetGroundAssetUrl {
  key: string;
  url: string;
}

export interface StreetGroundPlacement {
  textureKey: string;
  x: number;
  topY: number;
  width: number;
  height: number;
  visibleTopY: number;
  surfaceY: number;
}

export const STREET_GROUND_SOURCE_WIDTH = streetGroundAsset.sourceWidth;
export const STREET_GROUND_SOURCE_HEIGHT = streetGroundAsset.sourceHeight;
export const STREET_GROUND_CROP_TOP = streetGroundAsset.cropTop;
export const STREET_GROUND_VISIBLE_TOP_SOURCE_Y = streetGroundAsset.visibleTopY;
export const STREET_GROUND_SURFACE_SOURCE_Y = streetGroundAsset.surfaceY;
export const STREET_GROUND_CHUNK_WIDTH = streetGroundAsset.chunkWidth;
export const STREET_GROUND_CROP_HEIGHT = STREET_GROUND_SOURCE_HEIGHT - STREET_GROUND_CROP_TOP;
export const STREET_GROUND_SURFACE_OFFSET = STREET_GROUND_SURFACE_SOURCE_Y - STREET_GROUND_CROP_TOP;
export const STREET_GROUND_VISIBLE_TOP_OFFSET =
  STREET_GROUND_VISIBLE_TOP_SOURCE_Y - STREET_GROUND_CROP_TOP;

function getChunkCount(): number {
  return Math.ceil(STREET_GROUND_SOURCE_WIDTH / STREET_GROUND_CHUNK_WIDTH);
}

function getChunkWidth(index: number): number {
  return Math.min(
    STREET_GROUND_CHUNK_WIDTH,
    STREET_GROUND_SOURCE_WIDTH - index * STREET_GROUND_CHUNK_WIDTH,
  );
}

function getTextureKey(index: number): string {
  return `${streetGroundAsset.textureKeyPrefix}-${index}`;
}

/** Build-time-derived texture URLs. The 15,000px source is never uploaded to WebGL. */
export function getStreetGroundAssetUrls(): StreetGroundAssetUrl[] {
  return Array.from({ length: getChunkCount() }, (_, index) => ({
    key: getTextureKey(index),
    url: `${GENERATED_ASSET_DIRECTORY}/${streetGroundAsset.generatedNamePrefix}-${index}.webp`,
  }));
}

/**
 * Reassembles the cropped source at a strict 1 source pixel = 1 world unit.
 * The authored 15,000px sequence remains intact; only after the full sequence
 * is exhausted does it wrap to cover any remaining world width.
 */
export function getStreetGroundPlacements(
  worldWidth: number,
  groundY: number,
): StreetGroundPlacement[] {
  if (!Number.isFinite(worldWidth) || worldWidth <= 0) return [];

  const topY = groundY - STREET_GROUND_SURFACE_OFFSET;
  const placements: StreetGroundPlacement[] = [];
  let x = 0;

  while (x < worldWidth) {
    for (let index = 0; index < getChunkCount() && x < worldWidth; index += 1) {
      const width = getChunkWidth(index);
      placements.push({
        textureKey: getTextureKey(index),
        x,
        topY,
        width,
        height: STREET_GROUND_CROP_HEIGHT,
        visibleTopY: topY + STREET_GROUND_VISIBLE_TOP_OFFSET,
        surfaceY: groundY,
      });
      x += width;
    }
  }

  return placements;
}
