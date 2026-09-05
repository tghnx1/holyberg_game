import { describe, expect, it } from 'vitest';
import {
  computeStageFit,
  DIALOGUE_STAGE_CANONICAL_HEIGHT,
  DIALOGUE_STAGE_CANONICAL_WIDTH,
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

  it('includes the divider underlap in the real stage render width', () => {
    const layout = computeDialogueLayout(DESIGN_WIDTH, DESIGN_HEIGHT);
    expect(layout.scenePanel.width).toBeGreaterThan(layout.scenePanelFrameWidth);
    expect(layout.scenePanel.width - layout.scenePanelFrameWidth).toBe(DialogueLayout.dividerSkew);
  });
});

/**
 * Dialogue 1 is the regression benchmark: at the design aspect the panel and
 * the canonical box coincide, so the shared fit has to reproduce exactly what
 * the station's own cover fit produced there — scale 1, no offset.
 */
describe('Dialogue stage framing', () => {
  it('cover-fits the actual widened scene panel at the design aspect', () => {
    const layout = computeDialogueLayout(DESIGN_WIDTH, DESIGN_HEIGHT);
    const panel = layout.scenePanel;
    const shared = computeStageFit(panel.width, panel.height);
    const previous = computeCoverFit(W, H, panel.width, panel.height);
    expect(shared.scale).toBeCloseTo(previous.scale);
    expect(shared.offsetX).toBeCloseTo(previous.offsetX);
    expect(shared.offsetY).toBeCloseTo(previous.offsetY);
    expect(shared.scale).toBeGreaterThan(1);
  });

  it('agrees with cover fit on every panel shape', () => {
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

  it('covers the entire stage panel on every axis', () => {
    for (const [width, height] of panels) {
      const fit = computeStageFit(width, height);
      expect(W * fit.scale).toBeGreaterThanOrEqual(width - 0.001);
      expect(H * fit.scale).toBeGreaterThanOrEqual(height - 0.001);
    }
  });

  it('scales uniformly — one number, never a per-axis stretch', () => {
    const fit = computeStageFit(W * 1.4, H);
    // A single `scale` is all the fit reports, so the two axes cannot diverge.
    expect(Object.keys(fit).sort()).toEqual(['offsetX', 'offsetY', 'scale']);
    expect(fit.scale).toBeGreaterThan(0);
  });

  it('centres overflow horizontally, so the scene is continuous beneath the seam', () => {
    const fit = computeStageFit(W * 0.5, H);
    expect(fit.offsetX).toBeCloseTo((W * 0.5 - W * fit.scale) / 2);
  });

  it('matches cover fit on a wide panel, preventing an uncovered right edge', () => {
    const width = W * 1.6;
    const height = H;
    const cover = computeCoverFit(W, H, width, height);
    const shared = computeStageFit(width, height);
    // Cover scales up to fill the width and pushes the composition past the
    // top and bottom of the body; the shared rule intentionally does too so
    // the actual scene reaches the diagonal divider.
    expect(H * cover.scale).toBeGreaterThan(height);
    expect(cover.offsetY).toBeLessThan(0);
    expect(shared.scale).toBeCloseTo(cover.scale);
    expect(shared.offsetY).toBeCloseTo(cover.offsetY);
  });

  it('is safe on a degenerate canonical box', () => {
    expect(computeStageFit(100, 100, 0, 0)).toEqual({ scale: 0, offsetX: 0, offsetY: 0 });
  });
});
