import { Depth, DESIGN_HEIGHT, DESIGN_WIDTH } from '../../constants';

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
  houses: {
    key: 'berlin-mid-buildings',
    baselineY: 675,
    targetHeight: 650,
    depth: Depth.MID_BACKGROUND,
  } satisfies BackgroundImageLayout,
  railwaySection: {
    key: 'berlin-railway',
    startX: FIRST_RAILWAY_START_X,
    sectionWidth: DESIGN_WIDTH,
    baselineY: 642,
    targetHeight: 650,
    depth: Depth.MID_BACKGROUND,
  },
  trains: {
    baselineY: 642,
    depth: Depth.MID_BACKGROUND,
    durationMs: 65000,
    repeatDelay: 1500,
    ease: 'Linear' as const,
    right: { key: 'berlin-train-right' },
    left: { key: 'berlin-train-left' },
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
