import { describe, expect, it } from 'vitest';
import { HIT_LINE_HALF_WIDTH, HIT_LINE_Y, HORIZON_HALF_WIDTH, HORIZON_Y } from '../src/game/rhythm/constants';
import { getHighwayGeometryAtY, getJudgementPadGeometry, getLaneBoundariesAtY, getPerspectivePosition } from '../src/game/rhythm/PerspectiveMath';
import { PAD_BOTTOM_Y, PAD_TOP_Y } from '../src/game/rhythm/constants';
import {
  getRhythmAssetLayout,
  RHYTHM_DECK_HEIGHT,
  RHYTHM_HIGHWAY_HEIGHT,
  RHYTHM_HIGHWAY_LOCAL_CENTER_X,
  RHYTHM_HIGHWAY_WIDTH,
  RHYTHM_MIXER_HEIGHT,
  RHYTHM_MIXER_WIDTH,
} from '../src/game/rhythm/RhythmAssetLayout';

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
  it('translates every lane by the live viewport center without changing proportions', () => {
    const oldCenter = 640;
    const newCenter = 900;
    const deltaX = newCenter - oldCenter;
    for (const lane of [0, 1, 2, 3] as const) {
      const oldNote = getPerspectivePosition(lane, 0.57, oldCenter);
      const newNote = getPerspectivePosition(lane, 0.57, newCenter);
      expect(newNote.x - oldNote.x).toBeCloseTo(deltaX);
      expect(newNote.y).toBe(oldNote.y);
      expect(newNote.scale).toBe(oldNote.scale);

      const oldPad = getJudgementPadGeometry(lane, oldCenter);
      const newPad = getJudgementPadGeometry(lane, newCenter);
      expect(newPad.centerX - oldPad.centerX).toBeCloseTo(deltaX);
      expect(newPad.centerY).toBe(oldPad.centerY);
      newPad.points.forEach((point, index) => expect(point).toBeCloseTo(oldPad.points[index]));
    }
  });
  it('matches the adapted Figma SVG paths to gameplay boundaries', () => {
    const assetCenter = RHYTHM_HIGHWAY_LOCAL_CENTER_X;
    expect(getLaneBoundariesAtY(HORIZON_Y, assetCenter)).toEqual([375, 427.5, 480, 532.5, 585]);
    expect(getLaneBoundariesAtY(HIT_LINE_Y, assetCenter)).toEqual([90, 285, 480, 675, 870]);
    const expectedPadTop = [80.80645161290323, 280.4032258064516, 480, 679.5967741935484, 879.1935483870968];
    const expectedPadBottom = [16.45161290322585, 248.22580645161293, 480, 711.7741935483871, 943.5483870967741];
    getLaneBoundariesAtY(PAD_TOP_Y, assetCenter).forEach((boundary, index) => expect(boundary).toBeCloseTo(expectedPadTop[index]));
    getLaneBoundariesAtY(PAD_BOTTOM_Y, assetCenter).forEach((boundary, index) => expect(boundary).toBeCloseTo(expectedPadBottom[index]));
    expect([RHYTHM_HIGHWAY_WIDTH, RHYTHM_HIGHWAY_HEIGHT]).toEqual([960, 720]);
  });
  it('reserves the bottom quarter for the DJ booth', () => {
    expect(HIT_LINE_Y / 720).toBeGreaterThanOrEqual(0.6);
    expect(HIT_LINE_Y / 720).toBeLessThanOrEqual(0.65);
    expect(PAD_BOTTOM_Y / 720).toBeGreaterThanOrEqual(0.7);
    expect(PAD_BOTTOM_Y / 720).toBeLessThanOrEqual(0.75);
    expect(PAD_BOTTOM_Y).toBeLessThan(getRhythmAssetLayout(centerX).deckY);
  });
  it('keeps proportional mirrored decks centered and partially cropped', () => {
    const layout = getRhythmAssetLayout(centerX);
    expect(layout.leftDeckX + layout.rightDeckX).toBe(centerX * 2);
    expect(layout.rightDeckX - centerX).toBe(centerX - layout.leftDeckX);
    expect(layout.deckY + RHYTHM_DECK_HEIGHT).toBeGreaterThan(720);
    expect(getRhythmAssetLayout(900).leftDeckX - layout.leftDeckX).toBe(260);
  });
  it('keeps the mixer compact, centered, and 40-50% visible', () => {
    const layout = getRhythmAssetLayout(centerX);
    const fCenter = getJudgementPadGeometry(1, centerX).centerX;
    const jCenter = getJudgementPadGeometry(2, centerX).centerX;
    const visibleRatio = (720 - layout.mixerY) / RHYTHM_MIXER_HEIGHT;
    expect(layout.mixerX).toBe(centerX);
    expect(RHYTHM_MIXER_WIDTH).toBeLessThan(jCenter - fCenter);
    expect(visibleRatio).toBeGreaterThanOrEqual(0.4);
    expect(visibleRatio).toBeLessThanOrEqual(0.5);
    expect(getRhythmAssetLayout(900).mixerX).toBe(900);
  });
});
