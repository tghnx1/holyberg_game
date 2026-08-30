import {
  RESIZE_HANDLES,
  resizeHandlePoints,
  type ResizeBounds,
  type ResizeHandle,
} from '../levelEditorResize';
import type { EditorMarker, EditorPoint } from './editorItem';

/**
 * Pure geometry the editor core needs, kept out of the core itself so the
 * fiddly parts — the ones that broke Level 4's overlay while the camera was
 * scrolled — are unit-testable without a running Scene or camera.
 *
 * Everything here is world-space. The camera contributes exactly one number,
 * `zoom`, and only ever to keep something a constant *screen* size: an
 * outline stroke, a handle square, a hit tolerance. Camera **scroll** never
 * appears in any of it, which is the point: the overlay is drawn by a
 * scrollFactor-1 graphics object living in the same world space as the
 * objects it outlines, so scrolling moves both together and they cannot
 * drift apart. Drawing world-space bounds into a scrollFactor-0 graphics is
 * exactly the bug this layer exists to make impossible.
 */

/** Smallest on-screen size an item is drawn and picked at, in screen px. */
export const MIN_PICK_SCREEN = 18;
/** Handle square size, in screen px. */
export const RESIZE_HANDLE_SCREEN = 9;
/** Marker (travel-end) radius, in screen px. */
export const MARKER_RADIUS = 11;

/**
 * A screen-space length expressed in world units at the current zoom, so a
 * handle stays the same size on screen however far the view is zoomed out.
 */
export function screenToWorldLength(screenLength: number, zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return screenLength;
  return screenLength / zoom;
}

export function boundsSize(bounds: ResizeBounds): { width: number; height: number } {
  return { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
}

/**
 * Grows a bounds box about its own centre until it is at least
 * `MIN_PICK_SCREEN` on screen, so a small object stays clickable zoomed out.
 *
 * About the box's own centre rather than the item's authored position: a
 * padded PNG's visible content is not necessarily centred in its box.
 */
export function pickBounds(bounds: ResizeBounds, zoom: number): ResizeBounds {
  const minimum = screenToWorldLength(MIN_PICK_SCREEN, zoom);
  const { width, height } = boundsSize(bounds);
  const growX = Math.max(0, minimum - width) / 2;
  const growY = Math.max(0, minimum - height) / 2;
  return {
    left: bounds.left - growX,
    right: bounds.right + growX,
    top: bounds.top - growY,
    bottom: bounds.bottom + growY,
  };
}

/**
 * The visible-content fraction of a full display box, for artwork whose
 * source PNG bakes transparent padding into a canvas larger than the drawn
 * art. Selection, outline and handles read the narrowed box so the padding
 * never inflates any of them.
 */
export interface VisualFraction {
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
}

/** Narrows a full display box down to just its visible artwork. */
export function narrowToVisual(full: ResizeBounds, fraction?: VisualFraction): ResizeBounds {
  if (!fraction) return full;
  const { width, height } = boundsSize(full);
  return {
    left: full.left + fraction.xRatio * width,
    right: full.left + (fraction.xRatio + fraction.widthRatio) * width,
    top: full.top + fraction.yRatio * height,
    bottom: full.top + (fraction.yRatio + fraction.heightRatio) * height,
  };
}

/**
 * Inverse of `narrowToVisual`: expands a resized visual box back out to the
 * equivalent full display box, so dragging the tight handles still resizes
 * the whole artwork proportionally rather than shrinking the real display
 * size down to the visible-content box.
 */
export function expandFromVisual(visual: ResizeBounds, fraction?: VisualFraction): ResizeBounds {
  if (!fraction) return visual;
  const { width, height } = boundsSize(visual);
  if (fraction.widthRatio <= 0 || fraction.heightRatio <= 0) return visual;
  const fullWidth = width / fraction.widthRatio;
  const fullHeight = height / fraction.heightRatio;
  const left = visual.left - fraction.xRatio * fullWidth;
  const top = visual.top - fraction.yRatio * fullHeight;
  return { left, right: left + fullWidth, top, bottom: top + fullHeight };
}

/**
 * The resize handle under `point`, if any. Tolerance is in screen px so a
 * handle is equally easy to grab at every zoom.
 */
export function handleAt(
  bounds: ResizeBounds,
  point: EditorPoint,
  zoom: number,
): ResizeHandle | undefined {
  const tolerance = screenToWorldLength(RESIZE_HANDLE_SCREEN + 4, zoom);
  const points = resizeHandlePoints(bounds);
  return RESIZE_HANDLES.find((handle) => {
    const candidate = points[handle];
    return (
      Math.abs(point.x - candidate.x) <= tolerance && Math.abs(point.y - candidate.y) <= tolerance
    );
  });
}

/** The extra marker under `point`, if any. */
export function markerAt(
  markers: readonly EditorMarker[],
  point: EditorPoint,
  zoom: number,
): EditorMarker | undefined {
  const tolerance = screenToWorldLength(MARKER_RADIUS + 4, zoom);
  return markers.find(
    (marker) =>
      Math.hypot(point.x - marker.point.x, point.y - marker.point.y) <= tolerance,
  );
}

/**
 * Grows a bounds box about its centre by `factor`, which is what the
 * keyboard `+`/`-` resize does.
 */
export function scaleBoundsAboutCentre(bounds: ResizeBounds, factor: number): ResizeBounds {
  const { width, height } = boundsSize(bounds);
  const growX = (width * factor - width) / 2;
  const growY = (height * factor - height) / 2;
  return {
    left: bounds.left - growX,
    right: bounds.right + growX,
    top: bounds.top - growY,
    bottom: bounds.bottom + growY,
  };
}

/** Translates a bounds box, which is what a drag and the arrow-key nudge do. */
export function translateBounds(bounds: ResizeBounds, dx: number, dy: number): ResizeBounds {
  return {
    left: bounds.left + dx,
    right: bounds.right + dx,
    top: bounds.top + dy,
    bottom: bounds.bottom + dy,
  };
}
