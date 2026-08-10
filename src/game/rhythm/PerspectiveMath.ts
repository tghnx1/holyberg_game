import { HIT_LINE_HALF_WIDTH, HIT_LINE_Y, HORIZON_HALF_WIDTH, HORIZON_Y, PAD_BOTTOM_Y, PAD_TOP_Y } from './constants';
import type { Lane } from './types';

export interface PerspectivePosition {
  x: number;
  y: number;
  scale: number;
  progress: number;
  halfWidth: number;
}

export function getLaneBoundaries(progress: number, screenCenterX: number): [number, number, number, number, number] {
  const clamped = Math.min(1, Math.max(0, progress));
  const halfWidth = HORIZON_HALF_WIDTH + (HIT_LINE_HALF_WIDTH - HORIZON_HALF_WIDTH) * clamped;
  return [-1, -0.5, 0, 0.5, 1].map((position) => screenCenterX + position * halfWidth) as [number, number, number, number, number];
}

export interface HighwayGeometry { y: number; boundaries: [number, number, number, number, number]; centres: [number, number, number, number]; left: number; right: number; }

export function getLaneBoundariesAtY(y: number, screenCenterX: number): [number, number, number, number, number] {
  const progress = (y - HORIZON_Y) / (HIT_LINE_Y - HORIZON_Y);
  const halfWidth = HORIZON_HALF_WIDTH + (HIT_LINE_HALF_WIDTH - HORIZON_HALF_WIDTH) * progress;
  return [-1, -0.5, 0, 0.5, 1].map((position) => screenCenterX + position * halfWidth) as [number, number, number, number, number];
}

export function getHighwayGeometryAtY(y: number, screenCenterX: number): HighwayGeometry {
  const boundaries = getLaneBoundariesAtY(y, screenCenterX);
  const centres = [0, 1, 2, 3].map((lane) => (boundaries[lane] + boundaries[lane + 1]) / 2) as [number, number, number, number];
  return { y, boundaries, centres, left: boundaries[0], right: boundaries[4] };
}

export function getLaneCenterX(lane: Lane, progress: number, screenCenterX: number): number {
  const boundaries = getLaneBoundaries(progress, screenCenterX);
  return (boundaries[lane] + boundaries[lane + 1]) / 2;
}

export interface JudgementPadGeometry { centerX: number; centerY: number; points: number[]; left: number; right: number; }

export function getJudgementPadGeometry(lane: Lane, screenCenterX: number): JudgementPadGeometry {
  const top = getLaneBoundariesAtY(PAD_TOP_Y, screenCenterX);
  const bottom = getLaneBoundariesAtY(PAD_BOTTOM_Y, screenCenterX);
  const topCenter = (top[lane] + top[lane + 1]) / 2;
  const bottomCenter = (bottom[lane] + bottom[lane + 1]) / 2;
  const centerX = (topCenter + bottomCenter) / 2;
  const centerY = (PAD_TOP_Y + PAD_BOTTOM_Y) / 2;
  return { centerX, centerY, left: top[lane], right: top[lane + 1], points: [bottom[lane] - centerX, PAD_BOTTOM_Y - centerY, bottom[lane + 1] - centerX, PAD_BOTTOM_Y - centerY, top[lane + 1] - centerX, PAD_TOP_Y - centerY, top[lane] - centerX, PAD_TOP_Y - centerY] };
}

export function getPerspectivePosition(
  lane: Lane,
  progress: number,
  screenCenterX: number,
): PerspectivePosition {
  const clamped = Math.min(1, Math.max(0, progress));
  const eased = clamped * clamped * (3 - 2 * clamped);
  const y = HORIZON_Y + (HIT_LINE_Y - HORIZON_Y) * eased;
  const halfWidth = HORIZON_HALF_WIDTH + (HIT_LINE_HALF_WIDTH - HORIZON_HALF_WIDTH) * eased;
  return {
    x: getLaneCenterX(lane, eased, screenCenterX),
    y,
    scale: 0.2 + 1.0 * eased,
    progress: clamped,
    halfWidth,
  };
}
