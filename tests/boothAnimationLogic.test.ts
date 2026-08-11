import { describe, expect, it } from 'vitest';
import { getComboVisualIntensity, getDeckSideForLane } from '../src/game/rhythm/BoothAnimationLogic';

describe('DJ booth animation routing', () => {
  it('routes D/F to the left deck and J/K to the right deck', () => {
    expect([0, 1, 2, 3].map((lane) => getDeckSideForLane(lane as 0 | 1 | 2 | 3))).toEqual([
      'left',
      'left',
      'right',
      'right',
    ]);
  });

  it('clamps combo-driven light intensity', () => {
    expect(getComboVisualIntensity(-1)).toBe(0);
    expect(getComboVisualIntensity(20)).toBe(0.5);
    expect(getComboVisualIntensity(40)).toBe(1);
    expect(getComboVisualIntensity(100)).toBe(1);
  });
});
