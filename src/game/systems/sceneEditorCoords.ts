/**
 * Pure world<->parent-local coordinate math for SceneEditor.
 *
 * Kept free of Phaser so it (and the bug it fixes — mixing world-space
 * bounds/pointer coordinates with a target's local x/y, which makes an
 * object inside a moved/scaled Container jump or fly away on drag/resize)
 * can be unit tested directly, without a running Scene.
 *
 * Translation + scale only: nothing SceneEditor edits is ever rotated, so
 * the chain math below deliberately doesn't carry rotation.
 */

export interface AncestorTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Converts a world-space point into the coordinate space of an object's
 * immediate parent container — the same space that object's own x/y are
 * already expressed in.
 *
 * `ancestors` is the chain from that immediate parent up to (and including)
 * the outermost root, closest first. An empty chain means "no parent
 * container", in which case world and local coordinates are the same value.
 */
export function worldPointToParentLocal(
  worldX: number,
  worldY: number,
  ancestors: readonly AncestorTransform[],
): { x: number; y: number } {
  let x = worldX;
  let y = worldY;
  // World space is built innermost-transform-first, outermost-last, so
  // undoing it walks the chain in reverse: outermost ancestor first.
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    x = (x - ancestor.x) / ancestor.scaleX;
    y = (y - ancestor.y) / ancestor.scaleY;
  }
  return { x, y };
}

export interface OriginTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
}

/**
 * Local-space AABB of an object, built directly from its own local
 * position/scale/origin and native (unscaled) size — never from
 * `getBounds()`. This is the only geometry resize math should ever start
 * from: `transform.x`/`transform.y` already live in the parent's local
 * space, so the box that comes out is automatically in that same space too,
 * with no world/local conversion needed for it at all (only the live
 * pointer position needs converting, via `worldPointToParentLocal`).
 */
export function localBoundsFromTransform(
  transform: OriginTransform,
  nativeWidth: number,
  nativeHeight: number,
): LocalRect {
  const width = nativeWidth * transform.scaleX;
  const height = nativeHeight * transform.scaleY;
  const left = transform.x - transform.originX * width;
  const top = transform.y - transform.originY * height;
  return { left, top, right: left + width, bottom: top + height };
}

/**
 * Inverts the position half of `localBoundsFromTransform`: recovers the x/y
 * a target should sit at so that, at its (unchanged) origin, it exactly
 * fills `bounds`. Used after a resize computes a new local bounds box, so
 * the anchor/opposite edge the resize was dragged from never moves.
 */
export function positionFromLocalBounds(
  bounds: LocalRect,
  originX: number,
  originY: number,
): { x: number; y: number } {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  return { x: bounds.left + originX * width, y: bounds.top + originY * height };
}

export interface LocalRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface WorldRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Re-expresses a world-space AABB in the same parent-local space as `worldPointToParentLocal`. */
export function worldRectToParentLocal(
  bounds: WorldRect,
  ancestors: readonly AncestorTransform[],
): LocalRect {
  const topLeft = worldPointToParentLocal(bounds.left, bounds.top, ancestors);
  const bottomRight = worldPointToParentLocal(bounds.right, bounds.bottom, ancestors);
  return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
}

/**
 * Inverse of `worldRectToParentLocal`: re-expresses a parent-local AABB back
 * in world space. The editor core outlines and hit-tests everything in world
 * space, so an adapter whose object lives inside moved/scaled containers
 * converts out with this and back in with `worldRectToParentLocal`.
 */
export function parentLocalRectToWorld(
  bounds: LocalRect,
  ancestors: readonly AncestorTransform[],
): WorldRect {
  let { left, top, right, bottom } = bounds;
  // Mirror of the reverse walk in `worldPointToParentLocal`: innermost first.
  for (const ancestor of ancestors) {
    left = left * ancestor.scaleX + ancestor.x;
    right = right * ancestor.scaleX + ancestor.x;
    top = top * ancestor.scaleY + ancestor.y;
    bottom = bottom * ancestor.scaleY + ancestor.y;
  }
  return { left, top, right, bottom };
}
