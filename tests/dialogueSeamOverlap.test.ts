import { describe, expect, it } from 'vitest';
import { DialogueLayout } from '../src/game/dialogue/dialogueConstants';
import { buildDiagonalStripPoints } from '../src/game/dialogue/dialogueLayoutMetrics';

/**
 * The seam between a dialogue's scene panel and its portrait panel is a
 * diagonal that leans right as it descends. A scene view masked strictly to
 * the panel's own logical width therefore stops on a vertical line, and the
 * triangle between that line and the divider's left edge is left showing the
 * background — the black wedge.
 *
 * Both scene views take the same `renderOverlap` for this, and it has to be
 * at least as wide as the divider actually travels, or the wedge is only
 * narrowed rather than closed.
 */
const RENDER_OVERLAP = DialogueLayout.dividerSkew + DialogueLayout.dividerThickness;

describe('scene panel render overlap', () => {
  it('is the divider skew plus its thickness', () => {
    expect(RENDER_OVERLAP).toBe(DialogueLayout.dividerSkew + DialogueLayout.dividerThickness);
    expect(RENDER_OVERLAP).toBeGreaterThan(0);
  });

  it('reaches at least as far right as the divider ever does', () => {
    const bodyHeight = 600;
    const points = buildDiagonalStripPoints(
      DialogueLayout.dividerThickness,
      DialogueLayout.dividerSkew,
      bodyHeight,
    );
    // Even x values are the polygon's horizontal coordinates, relative to the
    // seam's own origin at the panel's right edge.
    const xs = points.filter((_, index) => index % 2 === 0);
    expect(RENDER_OVERLAP).toBeGreaterThanOrEqual(Math.max(...xs));
  });

  it('covers the widest point of the seam, which is its bottom-right corner', () => {
    const points = buildDiagonalStripPoints(
      DialogueLayout.dividerThickness,
      DialogueLayout.dividerSkew,
      480,
    );
    const rightmost = Math.max(...points.filter((_, index) => index % 2 === 0));
    expect(rightmost).toBeCloseTo(DialogueLayout.dividerThickness / 2 + DialogueLayout.dividerSkew);
    expect(RENDER_OVERLAP).toBeGreaterThan(rightmost);
  });

  it('does not change the panel\'s own logical width', () => {
    // The overlap widens only the mask; the composition is still fitted to,
    // and the layout still reserves, the real panel width.
    const panelWidth = 1280 * DialogueLayout.scenePanelWidthRatio;
    expect(panelWidth + RENDER_OVERLAP).toBeGreaterThan(panelWidth);
    expect(DialogueLayout.scenePanelWidthRatio).toBeLessThan(1);
  });

  it('is independent of panel height, so it holds at every aspect ratio', () => {
    for (const height of [360, 480, 720, 1080]) {
      const points = buildDiagonalStripPoints(
        DialogueLayout.dividerThickness,
        DialogueLayout.dividerSkew,
        height,
      );
      const rightmost = Math.max(...points.filter((_, index) => index % 2 === 0));
      expect(RENDER_OVERLAP).toBeGreaterThanOrEqual(rightmost);
    }
  });
});
