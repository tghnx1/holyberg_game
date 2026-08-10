import { mapPointToTapAction } from './DjMixLayout';
import type { RhythmAction } from './types';

export const SWIPE_MIN_DISTANCE = 82;
export const TAP_MAX_DISTANCE = 34;
export const HOLD_MIN_MS = 520;

export interface DjGestureSession {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startMs: number;
  resolved: boolean;
}
export function beginDjGesture(x: number, y: number, nowMs: number): DjGestureSession {
  return { startX: x, startY: y, lastX: x, lastY: y, startMs: nowMs, resolved: false };
}

export function updateDjGesture(
  gesture: DjGestureSession,
  x: number,
  y: number,
): Extract<RhythmAction, 'swipeLeft' | 'swipeRight'> | null {
  gesture.lastX = x;
  gesture.lastY = y;
  if (gesture.resolved) return null;
  const deltaX = x - gesture.startX;
  const deltaY = y - gesture.startY;
  if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return null;
  return deltaX < 0 ? 'swipeLeft' : 'swipeRight';
}

export function getHoldProgress(gesture: DjGestureSession, nowMs: number): number {
  const distance = Math.hypot(gesture.lastX - gesture.startX, gesture.lastY - gesture.startY);
  if (gesture.resolved || distance > TAP_MAX_DISTANCE) return 0;
  return Math.min(1, Math.max(0, (nowMs - gesture.startMs) / HOLD_MIN_MS));
}

export function getHeldAction(gesture: DjGestureSession, nowMs: number): Extract<RhythmAction, 'holdFx'> | null {
  return getHoldProgress(gesture, nowMs) >= 1 ? 'holdFx' : null;
}

export function finishDjGesture(
  gesture: DjGestureSession,
  x: number,
  y: number,
  nowMs: number,
  centerX: number,
): RhythmAction | null {
  const swipe = updateDjGesture(gesture, x, y);
  if (swipe) return swipe;
  if (gesture.resolved) return null;
  if (getHeldAction(gesture, nowMs)) return 'holdFx';
  const distance = Math.hypot(x - gesture.startX, y - gesture.startY);
  if (distance > TAP_MAX_DISTANCE) return null;
  return mapPointToTapAction(gesture.startX, gesture.startY, centerX);
}
