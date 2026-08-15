import { describe, expect, it } from 'vitest';
import { GOOD_WINDOW_MS, OK_WINDOW_MS, PAD_TOP_Y, PERFECT_WINDOW_MS } from '../src/game/rhythm/constants';
import { judgeTiming } from '../src/game/rhythm/JudgementSystem';
import { getTouchArea, mapLogicalPointerToLane, physicalToLogicalX, TOUCH_ZONE_BOTTOM_Y, TOUCH_ZONE_TOP_Y } from '../src/game/rhythm/TouchLaneMapper';
import { TutorialProgress } from '../src/game/rhythm/TutorialProgress';
import { getLaneBoundaries } from '../src/game/rhythm/PerspectiveMath';

describe('rhythm touch onboarding', () => {
  const centerX = 640;

  it('maps pointer X coordinates and exact boundaries to four lanes', () => {
    const area = getTouchArea(centerX);
    const boundaries = getLaneBoundaries(1, centerX);
    for (const y of [area.top, PAD_TOP_Y, area.bottom]) {
      expect(mapLogicalPointerToLane(boundaries[0], y, area)).toBe(0);
      expect(mapLogicalPointerToLane(boundaries[1] - 0.01, y, area)).toBe(0);
      expect(mapLogicalPointerToLane(boundaries[1], y, area)).toBe(1);
      expect(mapLogicalPointerToLane(boundaries[2], y, area)).toBe(2);
      expect(mapLogicalPointerToLane(boundaries[3], y, area)).toBe(3);
      expect(mapLogicalPointerToLane(boundaries[4], y, area)).toBe(3);
    }
    expect(mapLogicalPointerToLane(area.right + 1, PAD_TOP_Y, area)).toBeNull();
    expect(mapLogicalPointerToLane(centerX, area.top - 1, area)).toBeNull();
    expect(area).toMatchObject({ top: TOUCH_ZONE_TOP_Y, bottom: TOUCH_ZONE_BOTTOM_Y, boundaries });
  });

  it('covers the full playable width with adjacent non-overlapping zones', () => {
    const area = getTouchArea(centerX);
    const y = (area.top + area.bottom) / 2;
    for (let lane = 0; lane < 4; lane += 1) {
      const midpoint = (area.boundaries[lane] + area.boundaries[lane + 1]) / 2;
      expect(mapLogicalPointerToLane(midpoint, y, area)).toBe(lane);
    }
    for (let x = area.left; x <= area.right; x += 1) expect(mapLogicalPointerToLane(x, y, area)).not.toBeNull();
  });

  it('translates all touch-zone boundaries with the live viewport center', () => {
    const baseline = getTouchArea(centerX);
    const shifted = getTouchArea(900);
    shifted.boundaries.forEach((boundary, index) => expect(boundary - baseline.boundaries[index]).toBe(260));
    expect([shifted.top, shifted.bottom]).toEqual([baseline.top, baseline.bottom]);
  });

  it('converts responsive physical X to logical canvas X', () => {
    expect(physicalToLogicalX(422, 0, 844)).toBeCloseTo(640);
    expect(physicalToLogicalX(512, 100, 824)).toBeCloseTo(640);
  });

  it('progresses tutorial only on its expected lane', () => {
    const tutorial = new TutorialProgress();
    expect(tutorial.hit(1)).toBe(false);
    expect(tutorial.currentLane).toBe(0);
    expect([0, 1, 2, 3].map((lane) => tutorial.hit(lane as 0 | 1 | 2 | 3))).toEqual([true, true, true, true]);
    expect(tutorial.complete).toBe(true);
  });

  it('uses the curated rhythm timing windows', () => {
    expect(PERFECT_WINDOW_MS).toBe(60);
    expect(GOOD_WINDOW_MS).toBe(120);
    expect(OK_WINDOW_MS).toBe(180);
    expect(judgeTiming(60)).toBe('PERFECT');
    expect(judgeTiming(120)).toBe('GOOD');
    expect(judgeTiming(180)).toBe('OK');
    expect(judgeTiming(181)).toBeNull();
  });
});
