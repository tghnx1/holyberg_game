import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../constants';

/**
 * The whole ResultScene composition is authored once against this fixed
 * (desktop-sized) box — every child's x/y is exactly what it was before the
 * scene became responsive — and `computeResultFit` fits that one box into
 * whatever the live camera actually is, uniformly scaled and centred.
 * `DESIGN_WIDTH x DESIGN_HEIGHT` is the same 1280x720 box Level 1/2/4 are
 * designed against, so a desktop viewport at that size (or wider, landscape)
 * renders pixel-identical to the previous fixed-coordinate version.
 *
 * Kept Phaser-free (unlike ResultScene.ts itself, which extends
 * `Phaser.Scene`) so this one calculation is unit-testable without a
 * running game — the same split `dialogueLayoutMetrics.ts` keeps from
 * `DialogueScene.ts`.
 */
export const RESULT_COMPOSITION_WIDTH = DESIGN_WIDTH;
export const RESULT_COMPOSITION_HEIGHT = DESIGN_HEIGHT;

export interface ResultFit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Fit `RESULT_COMPOSITION_WIDTH x RESULT_COMPOSITION_HEIGHT` inside
 * `panelWidth x panelHeight` without ever cropping it (unlike the "cover"
 * fits elsewhere, e.g. dialogueLayoutMetrics.computeCoverFit) and without
 * upscaling past the authored desktop size, so a wide monitor doesn't blow
 * the composition up. Centred on both axes, unlike computeContainFit's
 * bottom anchor — this is a whole UI block, not a character standing on a
 * floor.
 */
export function computeResultFit(panelWidth: number, panelHeight: number): ResultFit {
  if (panelWidth <= 0 || panelHeight <= 0) return { scale: 0, offsetX: 0, offsetY: 0 };
  const scale = Math.min(
    1,
    panelWidth / RESULT_COMPOSITION_WIDTH,
    panelHeight / RESULT_COMPOSITION_HEIGHT,
  );
  return {
    scale,
    offsetX: (panelWidth - RESULT_COMPOSITION_WIDTH * scale) / 2,
    offsetY: (panelHeight - RESULT_COMPOSITION_HEIGHT * scale) / 2,
  };
}
