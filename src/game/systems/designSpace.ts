import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../constants';
import type { SceneObjectLayout } from './sceneLayout';

/**
 * The canonical box every *world-space* authored coordinate is expressed
 * against, and the reason a layout authored on a desktop reproduces the same
 * composition on a phone.
 *
 * Two different kinds of thing live in `sceneLayout.json`, and conflating
 * them is what made Level 4 reframe itself on mobile:
 *
 * - **Screen-space compositions** — the dialogue's scene/portrait panels —
 *   are genuinely fractions of a live panel that changes size with the
 *   viewport. `DialogueStageViewport` resolves those against its own live
 *   panel width, which is correct: the panel *is* the thing being divided up.
 * - **World-space positions** — an NPC standing in a room, a trigger line, a
 *   fall zone — are points in a world that exists independently of how much
 *   of it a given screen happens to show. Resolving those against the live
 *   camera made a world coordinate a function of the browser window: the
 *   game runs `Phaser.Scale.EXPAND` from a 720-unit base, so the logical
 *   height is pinned at `DESIGN_HEIGHT` on every landscape device while the
 *   logical *width* comes out as `DESIGN_HEIGHT * aspectRatio` — 1280 at
 *   16:9, ~1560 on a landscape phone. Multiplying a stored ratio by that
 *   width moved every authored world x by ~20% between the two.
 *
 * So world-space values are resolved against this fixed box instead. The
 * principle is the one the dialogue stage already uses (`ToiletSceneView`
 * stores its actor offsets as fractions of `TOILET_CANONICAL_WIDTH`, not of
 * the live panel): author against a canonical space, and let the camera —
 * not the stored data — decide how much of it a screen shows.
 *
 * Because `DESIGN_HEIGHT` is exactly the logical height the scale manager
 * pins, one design unit is one rendered logical unit on every supported
 * (landscape) viewport, so these are world pixels in the most literal sense.
 * Ratios rather than raw pixels only so the persisted shape, its schema and
 * its save route stay the single ones the whole project already uses.
 */
export const DESIGN_SPACE = { width: DESIGN_WIDTH, height: DESIGN_HEIGHT } as const;

export interface DesignPoint {
  x: number;
  y: number;
}

/**
 * The world-space point an authored entry describes, falling back per axis so
 * an entry that only pins one coordinate still composes with the default for
 * the other.
 */
export function designPointFromLayout(
  layout: SceneObjectLayout | undefined,
  fallback: DesignPoint,
): DesignPoint {
  return {
    x: layout?.xRatio === undefined ? fallback.x : layout.xRatio * DESIGN_SPACE.width,
    y: layout?.yRatio === undefined ? fallback.y : layout.yRatio * DESIGN_SPACE.height,
  };
}

/** Inverse of `designPointFromLayout`, for what the editor is about to save. */
export function layoutRatiosFromDesignPoint(point: DesignPoint): {
  xRatio: number;
  yRatio: number;
} {
  return { xRatio: point.x / DESIGN_SPACE.width, yRatio: point.y / DESIGN_SPACE.height };
}
