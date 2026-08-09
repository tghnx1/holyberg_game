import berlinBackgroundAssets from '../assets/berlinBackgroundAssets.json';

export type AssetQualityProfile = 'mobile' | 'medium' | 'desktop';

export interface AssetQualityCapabilities {
  viewportWidth: number;
  viewportHeight: number;
  touchCapable: boolean;
  coarsePointer: boolean;
  maxTextureSize?: number;
}

export interface BerlinBackgroundAssetUrl {
  key: string;
  url: string;
}

const PHONE_MAX_LONG_EDGE = 1024;
const PHONE_MAX_SHORT_EDGE = 600;
const MOBILE_TEXTURE_LIMIT = 3072;
const DESKTOP_TEXTURE_LIMIT = 4096;
const GENERATED_ASSET_DIRECTORY = 'assets/backgrounds/generated';

/**
 * Selects one download profile before Phaser queues any Berlin backgrounds.
 *
 * Viewport dimensions are CSS pixels. The short-edge check distinguishes a
 * phone-shaped viewport from tablets that can share the same 1024px long edge;
 * it is capability-based and deliberately contains no device-model detection.
 */
export function getAssetQualityProfile({
  viewportWidth,
  viewportHeight,
  touchCapable,
  coarsePointer,
  maxTextureSize,
}: AssetQualityCapabilities): AssetQualityProfile {
  let textureCapProfile: AssetQualityProfile = 'desktop';
  if (maxTextureSize !== undefined && Number.isFinite(maxTextureSize) && maxTextureSize > 0) {
    if (maxTextureSize < MOBILE_TEXTURE_LIMIT) return 'mobile';
    if (maxTextureSize < DESKTOP_TEXTURE_LIMIT) textureCapProfile = 'medium';
  }

  const width = Math.max(0, viewportWidth);
  const height = Math.max(0, viewportHeight);
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const touchOrCoarse = touchCapable || coarsePointer;

  if (
    touchOrCoarse &&
    longEdge <= PHONE_MAX_LONG_EDGE &&
    shortEdge <= PHONE_MAX_SHORT_EDGE
  ) {
    return 'mobile';
  }
  if (touchOrCoarse) return 'medium';
  return textureCapProfile;
}

/** Builds the generated URL without consulting browser or Phaser state. */
export function getOptimizedBerlinBackgroundUrl(
  assetName: string,
  profile: AssetQualityProfile,
): string {
  return `${GENERATED_ASSET_DIRECTORY}/${assetName}.${profile}.webp`;
}

/** Keeps stable Phaser keys while changing only the downloaded source URL. */
export function getBerlinBackgroundAssetUrls(
  profile: AssetQualityProfile,
): BerlinBackgroundAssetUrl[] {
  return berlinBackgroundAssets.assets.map((asset) => ({
    key: asset.textureKey,
    url: getOptimizedBerlinBackgroundUrl(asset.name, profile),
  }));
}
