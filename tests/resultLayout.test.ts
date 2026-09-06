import { describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../src/game/constants';
import {
  computeResultFit,
  RESULT_COMPOSITION_HEIGHT,
  RESULT_COMPOSITION_WIDTH,
} from '../src/game/scenes/resultLayout';

describe('the results composition box', () => {
  it('is the same 1280x720 box every other level is designed against', () => {
    expect(RESULT_COMPOSITION_WIDTH).toBe(DESIGN_WIDTH);
    expect(RESULT_COMPOSITION_HEIGHT).toBe(DESIGN_HEIGHT);
  });
});

describe('computeResultFit', () => {
  it('is scale 1 with no offset at exactly the composition size — the desktop composition is preserved', () => {
    const fit = computeResultFit(RESULT_COMPOSITION_WIDTH, RESULT_COMPOSITION_HEIGHT);
    expect(fit.scale).toBe(1);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(0);
  });

  it('never upscales past 1 on a panel larger than the composition (a wide desktop monitor)', () => {
    const fit = computeResultFit(RESULT_COMPOSITION_WIDTH * 2, RESULT_COMPOSITION_HEIGHT * 2);
    expect(fit.scale).toBe(1);
    // Centred, not pinned to a corner.
    expect(fit.offsetX).toBeCloseTo(RESULT_COMPOSITION_WIDTH / 2);
    expect(fit.offsetY).toBeCloseTo(RESULT_COMPOSITION_HEIGHT / 2);
  });

  it('shrinks uniformly (contain, not cover) on a narrower-than-16:9 landscape viewport, never cropping', () => {
    // e.g. a tablet in landscape: height pinned at 720 by Scale.EXPAND,
    // width narrower than the 1280 the composition was authored at.
    const panelWidth = 960;
    const panelHeight = RESULT_COMPOSITION_HEIGHT;
    const fit = computeResultFit(panelWidth, panelHeight);

    expect(fit.scale).toBeCloseTo(panelWidth / RESULT_COMPOSITION_WIDTH);
    expect(fit.scale).toBeLessThan(1);
    // The whole composition, scaled, must fit entirely inside the panel —
    // this is the "no important text/button clipped" guarantee.
    expect(RESULT_COMPOSITION_WIDTH * fit.scale).toBeLessThanOrEqual(panelWidth + 1e-6);
    expect(RESULT_COMPOSITION_HEIGHT * fit.scale).toBeLessThanOrEqual(panelHeight + 1e-6);
  });

  it('is the tighter of the two axes, whichever binds', () => {
    // Width binds.
    const widthBound = computeResultFit(640, 720);
    expect(widthBound.scale).toBeCloseTo(640 / RESULT_COMPOSITION_WIDTH);

    // Height binds.
    const heightBound = computeResultFit(RESULT_COMPOSITION_WIDTH, 360);
    expect(heightBound.scale).toBeCloseTo(360 / RESULT_COMPOSITION_HEIGHT);
  });

  it('centres the scaled composition on both axes', () => {
    const panelWidth = 1000;
    const panelHeight = 700;
    const fit = computeResultFit(panelWidth, panelHeight);

    const scaledWidth = RESULT_COMPOSITION_WIDTH * fit.scale;
    const scaledHeight = RESULT_COMPOSITION_HEIGHT * fit.scale;
    expect(fit.offsetX).toBeCloseTo((panelWidth - scaledWidth) / 2);
    expect(fit.offsetY).toBeCloseTo((panelHeight - scaledHeight) / 2);
  });

  it('is safe (no NaN/negative-scale) against a zero or negative panel', () => {
    expect(computeResultFit(0, 500)).toEqual({ scale: 0, offsetX: 0, offsetY: 0 });
    expect(computeResultFit(500, 0)).toEqual({ scale: 0, offsetX: 0, offsetY: 0 });
    expect(computeResultFit(-100, 500)).toEqual({ scale: 0, offsetX: 0, offsetY: 0 });
  });

  it('is deterministic', () => {
    expect(computeResultFit(900, 700)).toEqual(computeResultFit(900, 700));
  });
});
