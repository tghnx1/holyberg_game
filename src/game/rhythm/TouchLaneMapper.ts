import type { Lane } from './types';
import { DESIGN_HEIGHT } from '../constants';
import { HIT_LINE_Y } from './constants';
import { getLaneBoundaries } from './PerspectiveMath';

export const TOUCH_ZONE_TOP_Y = HIT_LINE_Y - 140;
export const TOUCH_ZONE_BOTTOM_Y = DESIGN_HEIGHT;

export interface TouchArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
  boundaries: [number, number, number, number, number];
}

export function physicalToLogicalX(clientX: number, canvasLeft: number, canvasDisplayWidth: number, logicalWidth = 1280): number {
  if (canvasDisplayWidth <= 0) return 0;
  return ((clientX - canvasLeft) / canvasDisplayWidth) * logicalWidth;
}

export function mapLogicalPointerToLane(x: number, y: number, area: TouchArea): Lane | null {
  if (x < area.left || x > area.right || y < area.top || y > area.bottom) return null;
  for (let lane = 0; lane < 4; lane += 1) {
    if (x >= area.boundaries[lane] && (x < area.boundaries[lane + 1] || (lane === 3 && x === area.boundaries[4]))) return lane as Lane;
  }
  return null;
}

export function getTouchArea(centerX: number): TouchArea {
  const boundaries = getLaneBoundaries(1, centerX);
  return {
    left: boundaries[0],
    right: boundaries[4],
    top: TOUCH_ZONE_TOP_Y,
    bottom: TOUCH_ZONE_BOTTOM_Y,
    boundaries,
  };
}
