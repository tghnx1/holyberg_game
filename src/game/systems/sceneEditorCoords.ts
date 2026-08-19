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
