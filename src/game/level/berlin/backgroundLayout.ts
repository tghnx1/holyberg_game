import { Depth, DESIGN_HEIGHT, DESIGN_WIDTH, RUN_SPEED, WORLD_WIDTH } from '../../constants';

export { DESIGN_WIDTH, DESIGN_HEIGHT };

/** World X where the first (and only) railway section begins. */
export const FIRST_RAILWAY_START_X = 0;

interface BackgroundImageLayout {
  key: string;
  /** World/local Y the image's bottom edge (origin 0,1) sits on. */
  baselineY: number;
  /** Uniform-scaled display height; width follows the texture's aspect ratio. */
  targetHeight: number;
  depth: number;
}

export const backgroundLayout = {
  sky: {
    key: 'berlin-sky',
    baselineY: DESIGN_HEIGHT,
    targetHeight: DESIGN_HEIGHT,
    targetWidth: DESIGN_WIDTH,
    depth: Depth.SKY,
  },
  city: {
    key: 'berlin-city',
    baselineY: 443,
    targetHeight: 640,
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
      initialDelayMs: 8000,
      repeat: 0,
      repeatDelayMs: 0,
      speed: RUN_SPEED + 50,
    },

    right: {
      key: 'berlin-train-right',
      startX: 7300,
      initialDelayMs: 0,
      repeat: -1,
      repeatDelayMs: 0,
    },
  },
  railwaySection: {
    key: 'berlin-railway',
    startX: FIRST_RAILWAY_START_X,
    sectionWidth: DESIGN_WIDTH,
    baselineY: 642,
    targetHeight: 650,
    depth: Depth.MID_BACKGROUND,
  },
  // Three separate house cutouts drawn at their natural texture size (no
  // scaling, no stretching to the world width) and dropped at the start,
  // middle and end of the level. `x` is the sprite's left edge, except for
  // the last one, which is anchored by its right edge to WORLD_WIDTH.
  houses: {
    baselineY: 675,
    depth: Depth.MID_BACKGROUND,
    /** Uniform shrink applied to every house; 0.5 renders them half size. */
    scale: 0.26,
    items: [
      { name: 'house-1', key: 'berlin-house-1', anchor: 'left' as const, x: -300 },
      { name: 'house-2', key: 'berlin-house-2', anchor: 'left' as const, x: WORLD_WIDTH / 2 },
      { name: 'house-3', key: 'berlin-house-3', anchor: 'right' as const, x: WORLD_WIDTH },
    ],
  },
  ground: {
    asphaltColor: 0x100c1b,
    voidColor: 0x050308,
    asphaltHeight: 110,
    asphaltOffsetY: 55,
    pitHeight: 440,
    pitOffsetY: 230,
    depth: Depth.GAMEPLAY,
  },
} as const;
