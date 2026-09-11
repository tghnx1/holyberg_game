import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../constants';
import {
  projectFrame,
  resolveCoverFrame,
  resolveGroundedProjection,
  type ArtFrame,
  type ArtProjection,
} from '../responsive/groundedCover';
import { BOSS_PLATFORM } from './bossAssets';
import { BOSS_ARENA } from './bossConfig';

/** Holyworld backdrop source size, behind the arena. */
export const BOSS_BACKDROP_SOURCE = { width: 1672, height: 940 } as const;

/**
 * How far above the standing line the platform's first visible row sits, in
 * design pixels — the depth the character's feet sink into the grass lip.
 *
 * A distance in the artwork, not on the screen: it was a flat 70px nudge,
 * which stayed 70px while the platform itself grew with the viewport width,
 * so on a phone the enlarged grass came out from under the player's feet and
 * left him hanging above it.
 */
const PLATFORM_LIP_DEPTH = 70;

/** The arena floor as a fraction of the logical height, which EXPAND pins at 720. */
export const BOSS_FLOOR_RATIO = BOSS_ARENA.floorY / DESIGN_HEIGHT;

/** Where the arena floor falls in a viewport of this height. */
export function bossFloorY(cameraHeight: number): number {
  return cameraHeight * BOSS_FLOOR_RATIO;
}

/** The backdrop's authored composition, as it is drawn at the design size. */
function resolveBackdropDesignFrame(): ArtFrame {
  return resolveCoverFrame(BOSS_BACKDROP_SOURCE, DESIGN_WIDTH, DESIGN_HEIGHT);
}

/**
 * The platform's authored composition: spanning the design width, seated so
 * its grass lip meets the arena floor.
 */
function resolvePlatformDesignFrame(): ArtFrame {
  const scale = DESIGN_WIDTH / BOSS_PLATFORM.sourceWidth;
  const height = BOSS_PLATFORM.sourceHeight * scale;
  const top = BOSS_ARENA.floorY - BOSS_PLATFORM.visibleTopRow * scale - PLATFORM_LIP_DEPTH;
  return { x: DESIGN_WIDTH / 2, y: top + height / 2, width: DESIGN_WIDTH, height };
}

/**
 * The one transform the whole arena is drawn through, so the backdrop and the
 * platform stay locked to the floor line the fight itself uses —
 * `BOSS_ARENA.floorY`, which the player, the lasers and the emeralds are all
 * placed from and which no viewport moves.
 */
export function resolveBossArenaProjection(width: number, height: number): ArtProjection {
  return resolveGroundedProjection({
    reference: resolveBackdropDesignFrame(),
    viewport: { width, height },
    designFloorY: BOSS_ARENA.floorY,
    liveFloorY: bossFloorY(height),
    // The platform is authored exactly `DESIGN_WIDTH` wide, and the ground has
    // to reach both screen edges even though the backdrop's own cover fit is a
    // hair wider than the design box and would otherwise leave a sliver.
    minScale: width / DESIGN_WIDTH,
  });
}

/** Backdrop and platform frames for a viewport, in draw order. */
export function resolveBossArenaFrames(
  width: number,
  height: number,
): { backdrop: ArtFrame; platform: ArtFrame } {
  const projection = resolveBossArenaProjection(width, height);
  return {
    backdrop: projectFrame(resolveBackdropDesignFrame(), projection),
    platform: projectFrame(resolvePlatformDesignFrame(), projection),
  };
}
