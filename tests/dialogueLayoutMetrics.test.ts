import { describe, expect, it } from 'vitest';
import { DialogueLayout } from '../src/game/dialogue/dialogueConstants';
import {
  buildDiagonalStripPoints,
  computePortraitFitScale,
  buildPortraitClipPoints,
  computeCoverFit,
  computeContainFit,
  computeDialogueLayout,
} from '../src/game/dialogue/dialogueLayoutMetrics';

describe('dialogue layout metrics', () => {
  it('stacks the top bar, body and bottom bar with no gaps or overlap', () => {
    const layout = computeDialogueLayout(1280, 720);
    expect(layout.topBar.y).toBe(0);
    expect(layout.scenePanel.y).toBe(layout.topBar.height);
    expect(layout.portraitPanel.y).toBe(layout.topBar.height);
    expect(layout.bottomBar.y).toBe(layout.topBar.height + layout.scenePanel.height);
    expect(layout.bottomBar.y + layout.bottomBar.height).toBe(720);
  });

  it('splits the body into a left scene panel and a right portrait panel with no gap', () => {
    const layout = computeDialogueLayout(1280, 720);
    expect(layout.scenePanel.x).toBe(0);
    expect(layout.portraitPanel.x).toBe(layout.scenePanel.width);
    expect(layout.scenePanel.width + layout.portraitPanel.width).toBe(1280);
    expect(layout.scenePanel.height).toBe(layout.portraitPanel.height);
  });

  it('keeps the same panel proportions across a wide desktop and a narrower mobile landscape width', () => {
    const desktop = computeDialogueLayout(1280, 720);
    const mobile = computeDialogueLayout(960, 720);
    const desktopRatio = desktop.scenePanel.width / desktop.width;
    const mobileRatio = mobile.scenePanel.width / mobile.width;
    // Sub-pixel rounding of the panel split is expected; the ratio itself is not.
    expect(mobileRatio).toBeCloseTo(desktopRatio, 2);
    // Bar heights don't depend on width.
    expect(mobile.topBar.height).toBe(desktop.topBar.height);
    expect(mobile.bottomBar.height).toBe(desktop.bottomBar.height);
  });

  it('never leaves the portrait side empty: the portrait panel always has width', () => {
    for (const width of [800, 960, 1280, 1600]) {
      const layout = computeDialogueLayout(width, 720);
      expect(layout.portraitPanel.width).toBeGreaterThan(0);
    }
  });

  it('builds a diagonal strip that drifts from the seam by the configured skew', () => {
    const points = buildDiagonalStripPoints(20, 90, 400);
    // Top edge centred on x=0.
    expect(points[0]).toBe(-10);
    expect(points[1]).toBe(0);
    expect(points[2]).toBe(10);
    expect(points[3]).toBe(0);
    // Bottom edge has drifted by the skew and sits at the given height.
    expect(points[4]).toBe(10 + 90);
    expect(points[5]).toBe(400);
    expect(points[6]).toBe(-10 + 90);
    expect(points[7]).toBe(400);
  });

  it('produces a real diagonal, not a straight vertical seam', () => {
    const layout = computeDialogueLayout(1280, 720);
    expect(DialogueLayout.dividerSkew).toBeGreaterThan(0);
    expect(layout.dividerPoints[4]).not.toBe(layout.dividerPoints[6]);
  });
});

describe('portrait clip polygon', () => {
  it('shares the top-left edge with the divider, so no seam gap appears', () => {
    const clip = buildPortraitClipPoints(300, 400, 20, 90);
    const divider = buildDiagonalStripPoints(20, 90, 400);
    // Clip's top-left x matches the divider band's own left edge at y=0.
    expect(clip[0]).toBe(divider[0]);
    expect(clip[1]).toBe(0);
  });

  it('excludes the wedge left of the diagonal at the bottom of the panel', () => {
    const clip = buildPortraitClipPoints(300, 400, 20, 90);
    const divider = buildDiagonalStripPoints(20, 90, 400);
    // Bottom-left x matches the divider band's own left edge at y=height.
    expect(clip[6]).toBe(divider[6]);
    expect(clip[7]).toBe(400);
    // The clip has drifted right by the skew, same as the divider.
    expect(clip[6]).toBeGreaterThan(clip[0]);
  });

  it('always covers the full right edge of the panel', () => {
    const clip = buildPortraitClipPoints(300, 400, 20, 90);
    expect(clip[2]).toBe(300);
    expect(clip[3]).toBe(0);
    expect(clip[4]).toBe(300);
    expect(clip[5]).toBe(400);
  });
});

describe('contain fit', () => {
  it('scales down to fit without cropping, anchored to the panel bottom', () => {
    const fit = computeContainFit(400, 800, 200, 300, 1);
    expect(fit.scale).toBeCloseTo(0.375); // limited by height: 300/800
    expect(fit.offsetX).toBeCloseTo((200 - 400 * fit.scale) / 2);
    expect(fit.offsetY).toBeCloseTo(300 - 800 * fit.scale);
  });

  it('applies the fill ratio as a further shrink', () => {
    const full = computeContainFit(400, 800, 200, 400, 1);
    const filled = computeContainFit(400, 800, 200, 400, 0.9);
    expect(filled.scale).toBeCloseTo(full.scale * 0.9);
  });
});

describe('cover fit', () => {
  it('scales up to fill the panel completely, cropping the larger axis', () => {
    const fit = computeCoverFit(400, 800, 300, 300);
    expect(fit.scale).toBeCloseTo(0.75); // max(300/400, 300/800) = 0.75
    // Fully covers both axes: no gap on either side.
    expect(400 * fit.scale).toBeGreaterThanOrEqual(300 - 1e-6);
    expect(800 * fit.scale).toBeGreaterThanOrEqual(300 - 1e-6);
  });
});

describe('portrait fit', () => {
  const RATIO = 0.96;

  it('fits by whichever axis is tighter', () => {
    // Tall source in a wide panel: height constrains.
    expect(computePortraitFitScale(1000, 500, 600, 1000, 1)).toBeCloseTo(0.5);
    // Wide source in a tall panel: width constrains.
    expect(computePortraitFitScale(500, 1000, 1000, 600, 1)).toBeCloseTo(0.5);
  });

  it('applies the fill ratio', () => {
    expect(computePortraitFitScale(800, 800, 800, 800, RATIO)).toBeCloseTo(RATIO);
  });

  it('gives differently shaped portraits different scales in the same panel', () => {
    // The reason setSpeaker has to refit rather than keep the previous scale.
    const square = computePortraitFitScale(600, 900, 800, 800, RATIO);
    const tall = computePortraitFitScale(600, 900, 600, 1000, RATIO);
    expect(square).not.toBeCloseTo(tall);
    // Neither overflows its panel.
    expect(800 * square).toBeLessThanOrEqual(600);
    expect(1000 * tall).toBeLessThanOrEqual(900);
  });

  it('never overflows the panel for a range of aspect ratios', () => {
    for (const [w, h] of [[400, 1200], [1200, 400], [1024, 575], [900, 900], [1, 4000]]) {
      const scale = computePortraitFitScale(700, 800, w, h, 1);
      expect(w * scale).toBeLessThanOrEqual(700 + 1e-9);
      expect(h * scale).toBeLessThanOrEqual(800 + 1e-9);
    }
  });

  it('falls back to 1 for a source with no dimensions', () => {
    expect(computePortraitFitScale(600, 900, 0, 0, RATIO)).toBe(1);
  });
});
