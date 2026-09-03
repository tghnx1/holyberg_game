export interface CoverImageLayout {
  x: number;
  y: number;
  scale: number;
  displayWidth: number;
  displayHeight: number;
}

/** One proportional image that covers the viewport without tiling or gaps. */
export function getCoverImageLayout(
  viewportWidth: number,
  viewportHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): CoverImageLayout {
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const scale = Math.max(
    Math.max(0, viewportWidth) / safeSourceWidth,
    Math.max(0, viewportHeight) / safeSourceHeight,
  );
  return {
    x: viewportWidth / 2,
    y: viewportHeight / 2,
    scale,
    displayWidth: safeSourceWidth * scale,
    displayHeight: safeSourceHeight * scale,
  };
}
