import { HIT_SCORE, HIT_TIME, START_TIME, USB_SCORE } from '../constants';
import type { BerlinProgress } from '../types/game';
export const initialProgress = (): BerlinProgress => ({
  state: 'intro',
  seconds: START_TIME,
  score: 0,
  hasUsb: false,
});
export const startRun = (p: BerlinProgress): BerlinProgress =>
  p.state === 'intro' ? { ...p, state: 'running' } : p;
export const applyObstacle = (p: BerlinProgress): BerlinProgress =>
  p.state === 'running'
    ? { ...p, seconds: Math.max(0, p.seconds - HIT_TIME), score: Math.max(0, p.score - HIT_SCORE) }
    : p;
export const collectUsb = (p: BerlinProgress): BerlinProgress =>
  p.hasUsb ? p : { ...p, hasUsb: true, score: p.score + USB_SCORE };
export const tryFinish = (p: BerlinProgress): BerlinProgress =>
  p.state === 'running' && p.hasUsb ? { ...p, state: 'won' } : p;
export const tickTimer = (p: BerlinProgress, delta: number): BerlinProgress => {
  if (p.state !== 'running') return p;
  const seconds = Math.max(0, p.seconds - delta);
  return { ...p, seconds, state: seconds === 0 ? 'gameOver' : 'running' };
};
