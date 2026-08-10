import { describe, expect, it } from 'vitest';
import { EXCELLENT_WINDOW_MS, GOOD_WINDOW_MS, MISS_WINDOW_MS, PERFECT_WINDOW_MS } from '../src/game/rhythm/constants';
import { judgeTiming } from '../src/game/rhythm/JudgementSystem';
import { getTouchArea, mapLogicalPointerToLane, physicalToLogicalX } from '../src/game/rhythm/TouchLaneMapper';
import { TutorialProgress } from '../src/game/rhythm/TutorialProgress';
import { getHighwayGeometryAtY } from '../src/game/rhythm/PerspectiveMath';

describe('rhythm touch onboarding', () => {
  const centerX = 640;

  it('maps pointer X coordinates and exact boundaries to four lanes', () => {
    const area = getTouchArea(centerX, 400);
    const boundaries = getHighwayGeometryAtY(600, centerX).boundaries;
    expect(mapLogicalPointerToLane(boundaries[0], 600, area)).toBe(0);
    expect(mapLogicalPointerToLane(boundaries[1] - 0.01, 600, area)).toBe(0);
    expect(mapLogicalPointerToLane(boundaries[1], 600, area)).toBe(1);
    expect(mapLogicalPointerToLane(boundaries[2], 600, area)).toBe(2);
    expect(mapLogicalPointerToLane(boundaries[4], 600, area)).toBe(3);
    expect(mapLogicalPointerToLane(area.right + 1, 600, area)).toBeNull();
    expect(mapLogicalPointerToLane(centerX, 400, area)).toBeNull();
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

  it('uses promotional timing windows', () => {
    expect(PERFECT_WINDOW_MS).toBe(70);
    expect(EXCELLENT_WINDOW_MS).toBe(130);
    expect(GOOD_WINDOW_MS).toBe(230);
    expect(MISS_WINDOW_MS).toBe(300);
    expect(judgeTiming(70)).toBe('PERFECT');
    expect(judgeTiming(130)).toBe('EXCELLENT');
    expect(judgeTiming(230)).toBe('GOOD');
    expect(judgeTiming(300)).toBeNull();
  });
});
