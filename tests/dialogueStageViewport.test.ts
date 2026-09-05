import { describe, expect, it } from 'vitest';
import {
  computeStageFit,
  DIALOGUE_STAGE_CANONICAL_HEIGHT,
  DIALOGUE_STAGE_CANONICAL_WIDTH,
  DIALOGUE_STAGE_RENDER_OVERLAP,
} from '../src/game/dialogue/DialogueStageViewport';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../src/game/constants';
import { DialogueLayout } from '../src/game/dialogue/dialogueConstants';
import {
  computeCoverFit,
  computeDialogueLayout,
} from '../src/game/dialogue/dialogueLayoutMetrics';

const W = DIALOGUE_STAGE_CANONICAL_WIDTH;
const H = DIALOGUE_STAGE_CANONICAL_HEIGHT;

describe('the shared canonical box', () => {
  it('is the scene panel at the aspect the game is designed for', () => {
    const layout = computeDialogueLayout(DESIGN_WIDTH, DESIGN_HEIGHT);
    const panel = layout.scenePanel;
    expect(W).toBe(layout.scenePanelFrameWidth);
    expect(H).toBe(panel.height);
  });

  it('carries the seam overlap both stages need', () => {
    expect(DIALOGUE_STAGE_RENDER_OVERLAP).toBe(
      DialogueLayout.dividerSkew + DialogueLayout.dividerThickness,
    );
  });
});

/**
 * Dialogue 1 is the regression benchmark: at the design aspect the panel and
 * the canonical box coincide, so the shared fit has to reproduce exactly what
 * the station's own cover fit produced there — scale 1, no offset.
 */
describe('Dialogue 1 framing is unchanged', () => {
  it('is identical to the previous cover fit at the design aspect', () => {
    const layout = computeDialogueLayout(DESIGN_WIDTH, DESIGN_HEIGHT);
    const panel = layout.scenePanel;
    const shared = computeStageFit(layout.scenePanelFrameWidth, panel.height);
    const previous = computeCoverFit(W, H, layout.scenePanelFrameWidth, panel.height);
    expect(shared.scale).toBeCloseTo(previous.scale);
    expect(shared.offsetX).toBeCloseTo(previous.offsetX);
    expect(shared.offsetY).toBeCloseTo(previous.offsetY);
    expect(shared.scale).toBeCloseTo(1);
  });

  it('agrees with the cover fit on any panel at or narrower than the canonical aspect', () => {
    // Where cover's tighter axis is already the height, the two rules pick the
    // same scale — so nothing that framed correctly before moves.
    for (const [width, height] of [
      [W, H],
      [W * 0.9, H],
      [W * 0.6, H],
    ]) {
      const shared = computeStageFit(width, height);
      const cover = computeCoverFit(W, H, width, height);
      expect(shared.scale).toBeCloseTo(cover.scale);
    }
  });
});

describe('the universal framing rule', () => {
  const panels: [number, number][] = [
    [W, H],
    [W * 1.4, H],
    [W * 0.7, H * 1.3],
    [420, 300],
    [900, 1600],
  ];

  it('never clips the composition vertically, on any panel', () => {
    for (const [width, height] of panels) {
      const fit = computeStageFit(width, height);
      // Top edge is on the panel's top, bottom edge on its bottom.
      expect(fit.offsetY).toBeCloseTo(0);
      expect(H * fit.scale).toBeLessThanOrEqual(height + 0.001);
      expect(H * fit.scale).toBeCloseTo(height);
    }
  });

  it('scales uniformly — one number, never a per-axis stretch', () => {
    const fit = computeStageFit(W * 1.4, H);
    // A single `scale` is all the fit reports, so the two axes cannot diverge.
    expect(Object.keys(fit).sort()).toEqual(['offsetX', 'offsetY', 'scale']);
    expect(fit.scale).toBeGreaterThan(0);
  });

  it('centres horizontally, so overflow is shared between both edges', () => {
    const fit = computeStageFit(W * 0.5, H);
    expect(fit.offsetX).toBeCloseTo((W * 0.5 - W * fit.scale) / 2);
  });

  it('does what a cover fit would not: refuses to crop a wide panel vertically', () => {
    const width = W * 1.6;
    const height = H;
    const cover = computeCoverFit(W, H, width, height);
    const shared = computeStageFit(width, height);
    // Cover scales up to fill the width and pushes the composition past the
    // top and bottom of the body; the shared rule does not.
    expect(H * cover.scale).toBeGreaterThan(height);
    expect(cover.offsetY).toBeLessThan(0);
    expect(H * shared.scale).toBeCloseTo(height);
    expect(shared.offsetY).toBeCloseTo(0);
  });

  it('is safe on a degenerate canonical box', () => {
    expect(computeStageFit(100, 100, 0, 0)).toEqual({ scale: 0, offsetX: 0, offsetY: 0 });
  });
});
