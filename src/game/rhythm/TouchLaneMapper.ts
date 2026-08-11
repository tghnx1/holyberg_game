import type { Lane } from './types';
import { HIT_LINE_Y, PAD_BOTTOM_Y } from './constants';
import { getHighwayGeometryAtY } from './PerspectiveMath';

export interface TouchArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function physicalToLogicalX(clientX: number, canvasLeft: number, canvasDisplayWidth: number, logicalWidth = 1280): number {
  if (canvasDisplayWidth <= 0) return 0;
  return ((clientX - canvasLeft) / canvasDisplayWidth) * logicalWidth;
}

export function mapLogicalPointerToLane(x: number, y: number, area: TouchArea): Lane | null {
  if (x < area.left || x > area.right || y < area.top || y > area.bottom) return null;
  const boundaries = getHighwayGeometryAtY(y, (area.left + area.right) / 2).boundaries;
  for (let lane = 0; lane < 4; lane += 1) if (x >= boundaries[lane] && (x < boundaries[lane + 1] || (lane === 3 && x === boundaries[4]))) return lane as Lane;
  return null;
}

export function getTouchArea(centerX: number): TouchArea {
  const top = HIT_LINE_Y;
  const bottom = PAD_BOTTOM_Y;
  const topGeometry = getHighwayGeometryAtY(top, centerX);
  const bottomGeometry = getHighwayGeometryAtY(bottom, centerX);
  return { left: Math.min(topGeometry.left, bottomGeometry.left), right: Math.max(topGeometry.right, bottomGeometry.right), top, bottom };
}
