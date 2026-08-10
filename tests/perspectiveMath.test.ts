import { describe, expect, it } from 'vitest';
import { HIT_LINE_HALF_WIDTH, HIT_LINE_Y, HORIZON_HALF_WIDTH, HORIZON_Y } from '../src/game/rhythm/constants';
import { getHighwayGeometryAtY, getJudgementPadGeometry, getPerspectivePosition } from '../src/game/rhythm/PerspectiveMath';
import { PAD_BOTTOM_Y, PAD_TOP_Y } from '../src/game/rhythm/constants';

describe('rhythm highway perspective', () => {
  const centerX = 640;

  it('places notes at the narrow horizon at progress zero', () => {
    const note = getPerspectivePosition(0, 0, centerX);
    expect(note.y).toBe(HORIZON_Y);
    expect(note.halfWidth).toBe(HORIZON_HALF_WIDTH);
    expect(note.scale).toBeCloseTo(0.2);
  });
  it('places notes at the wide judgement line at progress one', () => {
    const note = getPerspectivePosition(3, 1, centerX);
    expect(note.y).toBe(HIT_LINE_Y);
    expect(note.halfWidth).toBe(HIT_LINE_HALF_WIDTH);
    expect(note.scale).toBeCloseTo(1.2);
  });
  it('widens lane positions toward the player', () => {
    const horizonGap = getPerspectivePosition(3, 0, centerX).x - getPerspectivePosition(0, 0, centerX).x;
    const hitGap = getPerspectivePosition(3, 1, centerX).x - getPerspectivePosition(0, 1, centerX).x;
    expect(hitGap).toBeGreaterThan(horizonGap);
  });
  it('derives every judgement pad from shared hit-line boundaries', () => {
    const top = getHighwayGeometryAtY(PAD_TOP_Y, centerX);
    const bottom = getHighwayGeometryAtY(PAD_BOTTOM_Y, centerX);
    for (let lane = 0; lane < 4; lane += 1) {
      const pad = getJudgementPadGeometry(lane as 0 | 1 | 2 | 3, centerX);
      expect(pad.points[0] + pad.centerX).toBe(bottom.boundaries[lane]);
      expect(pad.points[2] + pad.centerX).toBe(bottom.boundaries[lane + 1]);
      expect(pad.points[4] + pad.centerX).toBe(top.boundaries[lane + 1]);
      expect(pad.points[6] + pad.centerX).toBe(top.boundaries[lane]);
      expect(pad.centerX).toBe((top.centres[lane] + bottom.centres[lane]) / 2);
      expect(pad.centerX).toBe(getHighwayGeometryAtY(pad.centerY, centerX).centres[lane]);
    }
  });
  it('keeps logical pad geometry unchanged across physical mobile sizes', () => {
    const baseline = getJudgementPadGeometry(2, centerX);
    [[1280, 720], [844, 390], [812, 375], [667, 375]].forEach(() => expect(getJudgementPadGeometry(2, centerX)).toEqual(baseline));
  });
});
