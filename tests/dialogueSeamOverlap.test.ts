import { describe, expect, it } from 'vitest';
import { DialogueLayout } from '../src/game/dialogue/dialogueConstants';
import {
  buildDiagonalStripPoints,
  computeDialogueLayout,
} from '../src/game/dialogue/dialogueLayoutMetrics';
import { computeStageFit } from '../src/game/dialogue/DialogueStageViewport';

/**
 * The seam between a dialogue's scene panel and its portrait panel is a
 * diagonal that leans right as it descends. A scene view masked strictly to
 * the panel's own logical width therefore stops on a vertical line, and the
 * triangle between that line and the divider's left edge is left showing the
 * background — the black wedge.
 *
 * The shared layout gives the real scene panel that extra width, and the
 * viewport cover-fits the actual source scene into it. There is no synthetic
 * edge-pixel or colour fill in the seam path.
 */

describe('dialogue scene under the diagonal divider', () => {
  it('gives the real scene panel enough width to reach the divider at every tested viewport', () => {
    for (const [width, height] of [[800, 480], [960, 720], [1280, 720], [1920, 1080]]) {
      const layout = computeDialogueLayout(width, height);
      const points = buildDiagonalStripPoints(
        DialogueLayout.dividerThickness,
        DialogueLayout.dividerSkew,
        layout.scenePanel.height,
      );
      const sceneRight = layout.scenePanel.x + layout.scenePanel.width;
      const dividerLeftAtBottom = layout.portraitPanel.x + points[6];
      expect(sceneRight).toBeGreaterThanOrEqual(dividerLeftAtBottom);
    }
  });

  it('cover-fits the source scene to that widened panel without per-axis stretching', () => {
    const layout = computeDialogueLayout(1280, 720);
    const fit = computeStageFit(layout.scenePanel.width, layout.scenePanel.height);
    expect(fit.scale).toBeGreaterThan(0);
    expect(fit.offsetX).toBeLessThanOrEqual(0.001);
    expect(fit.offsetY).toBeLessThanOrEqual(0.001);
  });
});
