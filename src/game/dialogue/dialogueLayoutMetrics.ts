/**
 * Pure geometry for the dialogue composition, derived from the current
 * viewport size.
 *
 * Kept free of Phaser so the panel/divider math can be unit tested and so
 * `DialogueScene` has a single source of truth to call from both `create()`
 * and every `onLayout` pass.
 */
import { DialogueLayout } from './dialogueConstants';

export interface DialoguePanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DialogueLayoutMetrics {
  width: number;
  height: number;
  topBar: DialoguePanelRect;
  bottomBar: DialoguePanelRect;
  /** The body strip between the two bars, before the scene/portrait split. */
  scenePanel: DialoguePanelRect;
  portraitPanel: DialoguePanelRect;
  /**
   * Polygon for the diagonal seam, local to the portrait panel's own origin
   * (0,0) so it can slide in lockstep with it: a strip that starts at the
   * seam at the top and drifts into the portrait side by the bottom.
   */
  dividerPoints: readonly number[];
}

/**
 * Points for a diagonal strip of `thickness` centred on x=0 at the top,
 * drifting `skew` pixels to the right by the time it reaches `bodyHeight` —
 * the shape used for both the divider's core band and its accent stripe.
 */
export function buildDiagonalStripPoints(
  thickness: number,
  skew: number,
  bodyHeight: number,
): number[] {
  return [
    -thickness / 2,
    0,
    thickness / 2,
    0,
    thickness / 2 + skew,
    bodyHeight,
    -thickness / 2 + skew,
    bodyHeight,
  ];
}

export function computeDialogueLayout(width: number, height: number): DialogueLayoutMetrics {
  const topBarHeight = DialogueLayout.topBarHeight;
  const bottomBarHeight = DialogueLayout.bottomBarHeight;
  const bodyHeight = Math.max(0, height - topBarHeight - bottomBarHeight);
  const sceneWidth = Math.round(width * DialogueLayout.scenePanelWidthRatio);
  const portraitWidth = Math.max(0, width - sceneWidth);

  return {
    width,
    height,
    topBar: { x: 0, y: 0, width, height: topBarHeight },
    bottomBar: { x: 0, y: height - bottomBarHeight, width, height: bottomBarHeight },
    scenePanel: { x: 0, y: topBarHeight, width: sceneWidth, height: bodyHeight },
    portraitPanel: { x: sceneWidth, y: topBarHeight, width: portraitWidth, height: bodyHeight },
    dividerPoints: buildDiagonalStripPoints(
      DialogueLayout.dividerThickness,
      DialogueLayout.dividerSkew,
      bodyHeight,
    ),
  };
}

/**
 * Uniform scale (plus centred offset) that fits a `referenceWidth` x
 * `referenceHeight` composition into `panelWidth` x `panelHeight` without
 * cropping it, filling `fillRatio` of whichever axis is tighter.
 */
export function computeContainFit(
  referenceWidth: number,
  referenceHeight: number,
  panelWidth: number,
  panelHeight: number,
  fillRatio: number,
): { scale: number; offsetX: number; offsetY: number } {
  if (referenceWidth <= 0 || referenceHeight <= 0) {
    return { scale: 0, offsetX: 0, offsetY: 0 };
  }
  const scale =
    Math.min(panelWidth / referenceWidth, panelHeight / referenceHeight) * fillRatio;
  return {
    scale,
    offsetX: (panelWidth - referenceWidth * scale) / 2,
    // Bottom-anchored: the composition's feet stay on the panel floor as it grows or shrinks.
    offsetY: panelHeight - referenceHeight * scale,
  };
}

/**
 * Uniform "cover" scale (plus centred offset) that fills `panelWidth` x
 * `panelHeight` entirely from a `referenceWidth` x `referenceHeight`
 * composition, cropping the overflow rather than letterboxing it.
 */
export function computeCoverFit(
  referenceWidth: number,
  referenceHeight: number,
  panelWidth: number,
  panelHeight: number,
): { scale: number; offsetX: number; offsetY: number } {
  if (referenceWidth <= 0 || referenceHeight <= 0) {
    return { scale: 0, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.max(panelWidth / referenceWidth, panelHeight / referenceHeight);
  return {
    scale,
    offsetX: (panelWidth - referenceWidth * scale) / 2,
    offsetY: (panelHeight - referenceHeight * scale) / 2,
  };
}
