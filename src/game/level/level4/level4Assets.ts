export const LEVEL4_ASSET_KEYS = {
  holyworldBackground: 'level4-holyworld-background',
  toiletStrip: 'level4-toilet-strip',
  stallDoor: 'level4-stall-door',
} as const;

/**
 * Authored pixel size of the toilet strip. Every position Level 4 and the
 * toilet dialogue derive is measured against *these* coordinates, never the
 * texture's, so the runtime texture can be re-exported at a different
 * resolution without moving a single stall, door or actor.
 */
export const TOILET_STRIP_NATIVE_WIDTH = 1532;
export const TOILET_STRIP_NATIVE_HEIGHT = 175;

/**
 * How many texture pixels the runtime asset stores per authored pixel.
 *
 * Multiply by this to read the texture, and divide a scale expressed in
 * authored pixels by it before handing that scale to Phaser.
 */
export const TOILET_TEXTURE_UPSCALE = 2;

export interface Level4ImageAsset {
  key: string;
  url: string;
}

export function getLevel4AssetUrls(): Level4ImageAsset[] {
  return [
    {
      key: LEVEL4_ASSET_KEYS.holyworldBackground,
      url: 'assets/level_4/holyworld-background.png',
    },
    // 2x nearest-neighbour upscale of the authored toilet-full.png, as WebP.
    // The renderer samples bilinearly (`pixelArt: false`) and Level 4 draws the
    // strip well above 1:1, so the source alone softens; baking the pixel edges
    // in at 2x keeps it crisp and is a *smaller* download than the PNG.
    // Regenerate with `npm run generate:level4-toilet`.
    { key: LEVEL4_ASSET_KEYS.toiletStrip, url: 'assets/level_4/toilet-full-2x.webp' },
    { key: LEVEL4_ASSET_KEYS.stallDoor, url: 'assets/level_4/stall-door.png' },
  ];
}
