export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface ResizeBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ResizePoint {
  x: number;
  y: number;
}

export interface MinimumResizeSize {
  width: number;
  height: number;
}

export const RESIZE_HANDLES: readonly ResizeHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
] as const;

export function resizeBoundsSize(bounds: ResizeBounds): { width: number; height: number } {
  return { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
}

export function resizeHandlePoints(bounds: ResizeBounds): Record<ResizeHandle, ResizePoint> {
  const centreX = (bounds.left + bounds.right) / 2;
  const centreY = (bounds.top + bounds.bottom) / 2;
  return {
    nw: { x: bounds.left, y: bounds.top },
    n: { x: centreX, y: bounds.top },
    ne: { x: bounds.right, y: bounds.top },
    e: { x: bounds.right, y: centreY },
    se: { x: bounds.right, y: bounds.bottom },
    s: { x: centreX, y: bounds.bottom },
    sw: { x: bounds.left, y: bounds.bottom },
    w: { x: bounds.left, y: centreY },
  };
}

function anchoredBounds(
  handle: ResizeHandle,
  original: ResizeBounds,
  width: number,
  height: number,
): ResizeBounds {
  const horizontalCentre = (original.left + original.right) / 2;
  const verticalCentre = (original.top + original.bottom) / 2;
  const left = handle.includes('w')
    ? original.right - width
    : handle.includes('e')
      ? original.left
      : horizontalCentre - width / 2;
  const top = handle.includes('n')
    ? original.bottom - height
    : handle.includes('s')
      ? original.top
      : verticalCentre - height / 2;
  return { left, right: left + width, top, bottom: top + height };
}

/** Pure resize geometry shared by pointer handling and unit tests. */
export function resizeBoundsFromPointer(
  original: ResizeBounds,
  handle: ResizeHandle,
  pointer: ResizePoint,
  minimum: MinimumResizeSize,
  preserveAspectRatio: boolean,
): ResizeBounds {
  const originalSize = resizeBoundsSize(original);
  const horizontal = handle.includes('w') || handle.includes('e');
  const vertical = handle.includes('n') || handle.includes('s');
  const anchorX = handle.includes('w') ? original.right : original.left;
  const anchorY = handle.includes('n') ? original.bottom : original.top;

  if (preserveAspectRatio) {
    const ratio = originalSize.width / originalSize.height;
    const minimumScale = Math.max(
      minimum.width / originalSize.width,
      minimum.height / originalSize.height,
    );
    let scale: number;
    if (horizontal && vertical) {
      const widthScale = Math.abs(pointer.x - anchorX) / originalSize.width;
      const heightScale = Math.abs(pointer.y - anchorY) / originalSize.height;
      scale = Math.max(minimumScale, widthScale, heightScale);
    } else if (horizontal) {
      scale = Math.max(minimumScale, Math.abs(pointer.x - anchorX) / originalSize.width);
    } else {
      scale = Math.max(minimumScale, Math.abs(pointer.y - anchorY) / originalSize.height);
    }
    return anchoredBounds(
      handle,
      original,
      originalSize.width * scale,
      (originalSize.width * scale) / ratio,
    );
  }

  let { left, right, top, bottom } = original;
  if (handle.includes('w')) left = Math.min(pointer.x, right - minimum.width);
  if (handle.includes('e')) right = Math.max(pointer.x, left + minimum.width);
  if (handle.includes('n')) top = Math.min(pointer.y, bottom - minimum.height);
  if (handle.includes('s')) bottom = Math.max(pointer.y, top + minimum.height);
  return { left, right, top, bottom };
}
