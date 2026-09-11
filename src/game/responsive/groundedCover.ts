/**
 * Cover art that keeps its floor where the player stands.
 *
 * Every full-bleed scene composition in the game is authored once at the
 * design size and then covered onto whatever viewport the device has. A plain
 * centred cover fit is correct only while the live aspect ratio matches the
 * one it was authored at: the game runs `Phaser.Scale.EXPAND` from a 720-unit
 * base, so a landscape phone keeps the logical height at `DESIGN_HEIGHT` and
 * stretches the logical *width* to `DESIGN_HEIGHT * aspectRatio` — ~1560 on an
 * iPhone 12, over 1800 once Safari's toolbars shrink the visible height. The
 * cover fit answers that extra width by scaling the art up and cropping the
 * overflow evenly top and bottom, which walks the authored floor line down and
 * off the bottom of the screen: the room sits too low, its lower half is cut,
 * and anything positioned from the live floor line (the player) is left
 * hanging above the ground everyone else is standing on.
 *
 * So the art is covered and then *grounded*: the scale still guarantees full
 * coverage, but the vertical placement is chosen so the authored floor line
 * lands exactly on the live floor line. Whatever crop is left is taken off the
 * top, which is ceiling and sky.
 *
 * The result is expressed as a projection — design point -> live point — so
 * the background, the furniture, the crowd and the player can all be placed
 * through the same transform and cannot drift apart.
 */

export interface ArtFrame {
  /** Centre of the drawn art. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Design space -> live space: `live = origin + design * scale`. */
export interface ArtProjection {
  x: number;
  y: number;
  scale: number;
}

export interface GroundedProjectionInput {
  /** The authored composition, as it is drawn at the design size. */
  reference: ArtFrame;
  viewport: { width: number; height: number };
  /** The floor line the composition was authored against, in design pixels. */
  designFloorY: number;
  /** Where that same floor line has to land in the live viewport. */
  liveFloorY: number;
  /**
   * A scale the composition may not go below, for a second piece of art that
   * rides the same transform and has its own span to satisfy — Level 3's
   * ground platform, which has to reach both screen edges even where the
   * backdrop behind it is already wide enough.
   */
  minScale?: number;
}

export interface CoverFrameOptions {
  /** Pushes the authored composition down, as some rooms are framed. */
  shiftY?: number;
  /** Extra scale on top of the cover fit, authored per composition. */
  overscan?: number;
}

/**
 * The plain centred cover fit an authored composition is drawn with at the
 * design size — the reference every live viewport is projected from.
 */
export function resolveCoverFrame(
  source: { width: number; height: number },
  width: number,
  height: number,
  options: CoverFrameOptions = {},
): ArtFrame {
  const shiftY = options.shiftY ?? 0;
  const sourceWidth = Math.max(1, source.width);
  const sourceHeight = Math.max(1, source.height);
  const cover = Math.max(width / sourceWidth, height / sourceHeight);
  // A composition pushed down needs enough overscan that the top edge it
  // uncovers is still filled: `displayHeight >= height + 2 * shiftY`.
  const scale = Math.max(cover * (options.overscan ?? 1), (height + 2 * shiftY) / sourceHeight);
  return {
    x: width / 2,
    y: height / 2 + shiftY,
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
}

/**
 * Maps an authored design-size composition onto the live viewport with its
 * floor line pinned.
 *
 * The scale is the largest of four requirements, so none of them can be
 * violated by satisfying another:
 *
 * - the authored vertical proportions, which are the desktop composition and
 *   the floor below which nothing may shrink;
 * - any `minScale` a second piece of art riding the transform asks for;
 * - covering the viewport's width;
 * - covering everything above the floor line, once the floor is pinned;
 * - covering everything below it.
 *
 * At the design size they all come out at 1, so the desktop composition is
 * returned untouched — this is an identity transform there, by construction.
 */
export function resolveGroundedProjection(input: GroundedProjectionInput): ArtProjection {
  const { reference, viewport, designFloorY, liveFloorY } = input;
  const above = Math.max(1e-6, designFloorY - (reference.y - reference.height / 2));
  const below = Math.max(1e-6, reference.y + reference.height / 2 - designFloorY);
  const scale = Math.max(
    input.minScale ?? 0,
    liveFloorY / Math.max(1e-6, designFloorY),
    viewport.width / Math.max(1, reference.width),
    liveFloorY / above,
    Math.max(0, viewport.height - liveFloorY) / below,
  );
  return {
    x: viewport.width / 2 - reference.x * scale,
    y: liveFloorY - designFloorY * scale,
    scale,
  };
}

/** The live frame an authored one is drawn at under `projection`. */
export function projectFrame(frame: ArtFrame, projection: ArtProjection): ArtFrame {
  return {
    x: projection.x + frame.x * projection.scale,
    y: projection.y + frame.y * projection.scale,
    width: frame.width * projection.scale,
    height: frame.height * projection.scale,
  };
}
