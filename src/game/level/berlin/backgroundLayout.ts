import { Depth, DESIGN_HEIGHT, DESIGN_WIDTH, RUN_SPEED, WORLD_WIDTH } from '../../constants';

export { DESIGN_WIDTH, DESIGN_HEIGHT };

interface BackgroundImageLayout {
  key: string;
  /** World/local Y the image's bottom edge (origin 0,1) sits on. */
  baselineY: number;
  /** Stable world display height, independent of the loaded raster tier. */
  targetHeight: number;
  /** Authoritative source-art ratio; optimized raster rounding must not alter it. */
  aspectRatio: number;
  depth: number;
}

/**
 * REFERENCE COMPOSITION: the current iPhone 13 landscape rendering.
 *
 * These are world-layout values, not asset-resolution values. Loading a
 * 2048, 3072 or 4096 pixel texture must never change them.
 */
export const REFERENCE_SKY_WIDTH = DESIGN_WIDTH * 1.3;
export const REFERENCE_HOUSE_TARGET_HEIGHT = 1365 * 0.551619;
export const REFERENCE_HOUSE_ASPECT_RATIO = 4096 / 1365;
export const REFERENCE_HOUSE_TARGET_WIDTH =
  REFERENCE_HOUSE_TARGET_HEIGHT * REFERENCE_HOUSE_ASPECT_RATIO;

export function getSkyDisplayWidth(logicalCameraWidth: number): number {
  // Preserve the authored 1664-wide iPhone composition. Wider cameras may
  // stretch only the viewport-fixed sky; ceil prevents a fractional edge gap.
  return Math.max(REFERENCE_SKY_WIDTH, Math.ceil(logicalCameraWidth));
}

export function getDisplaySize(
  targetHeight: number,
  authoritativeAspectRatio: number,
): { width: number; height: number } {
  return { width: targetHeight * authoritativeAspectRatio, height: targetHeight };
}

export const backgroundLayout = {
  sky: {
    key: 'berlin-sky',
    baselineY: DESIGN_HEIGHT,
    targetHeight: DESIGN_HEIGHT,
    targetWidth: REFERENCE_SKY_WIDTH,
    depth: Depth.SKY,
  },
  city: {
    key: 'berlin-city',
    baselineY: 443,
    targetHeight: 640,
    aspectRatio: 2172 / 724,
    depth: Depth.MID_BACKGROUND,
  } satisfies BackgroundImageLayout,
  trains: {
    baselineY: 429,
    depth: Depth.MID_BACKGROUND,
    /** Default px/s each train travels; a train may override it with `speed`. */
    speed: RUN_SPEED,
    ease: 'Linear' as const,

    // Rides alongside the player for the whole level: same speed as the
    // character, so it holds a fixed spot on screen from x 0 to the far end
    // of the map. train-right still sweeps past it head-on around t=14s.
    left: {
      key: 'berlin-train-left',
      startX: 1000,
      initialDelayMs: 10000,
      repeat: 0,
      repeatDelayMs: 0,
      speed: RUN_SPEED + 120,
    },

    // One pass from startX, then it keeps re-entering from the far end of
    // the level and sweeping left again, so it stays ahead of the player
    // instead of looping back into ground already covered.
    right: {
      key: 'berlin-train-right',
      startX: 7300,
      initialDelayMs: 0,
      repeat: -1,
      repeatDelayMs: 0,
      loopStartX: WORLD_WIDTH,
    },
  },
  // Narrower than the level and centred on it, so it leaves an equal margin
  // at each end rather than starting at a fixed offset. Its scroll factor is
  // below 1, so it drifts past slower than the ground.
  railwaySection: {
    key: 'berlin-railway',
    width: 14000,
    baselineY: 642,
    targetHeight: 650,
    textureAspectRatio: 2048 / 1420,
    scrollFactorX: 0.2,
    depth: Depth.MID_BACKGROUND,
  },
  // Three separate house cutouts drawn at their natural texture size (no
  // scaling, no stretching to the world width) and dropped at the start,
  // middle and end of the level. `x` is the sprite's left edge, except for
  // the last one, which is anchored by its right edge to WORLD_WIDTH.
  houses: {
    baselineY: 675,
    depth: Depth.MID_BACKGROUND,
    // Explicit world dimensions preserve the current 4096x1365 @ 0.551619
    // composition even when a selected WebP tier has rounded pixel dimensions.
    targetHeight: REFERENCE_HOUSE_TARGET_HEIGHT,
    aspectRatio: REFERENCE_HOUSE_ASPECT_RATIO,
    items: [
      { name: 'house-1', key: 'berlin-house-1', anchor: 'left' as const, x: -300 },
      { name: 'house-2', key: 'berlin-house-2', anchor: 'left' as const, x: WORLD_WIDTH / 2 },
      { name: 'house-3', key: 'berlin-house-3', anchor: 'right' as const, x: WORLD_WIDTH },
    ],
  },
  ground: {
    depth: Depth.GAMEPLAY,
  },
} as const;
