/** Layout and palette for the Hotline Miami-style dialogue presentation. */

export const DialogueDepth = {
  SCENE: 10,
  PORTRAIT: 20,
  DIVIDER: 30,
  BARS: 40,
  TEXT: 50,
  GLITCH: 60,
  SKIP: 70,
} as const;

export const DialogueLayout = {
  /** Full-width black bars that frame the composition. */
  topBarHeight: 118,
  bottomBarHeight: 178,
  /** Fraction of the width taken by the left-hand scene panel. */
  scenePanelWidthRatio: 0.56,
  textPaddingX: 56,
  speakerOffsetY: 22,
  textOffsetY: 58,
  /** How much of the portrait panel's box the Magician composition fills. */
  portraitFillRatio: 0.96,
  /** Thickness of the diagonal seam between the scene and portrait panels. */
  dividerThickness: 26,
  /** Horizontal drift of the diagonal from top to bottom of the body. */
  dividerSkew: 96,
} as const;

export const DialoguePalette = {
  bar: 0x000000,
  speaker: '#ff477e',
  text: '#ffffff',
  skipHint: '#8a7fa0',
  glitch: 0xffffff,
  dividerCore: 0x0a0612,
  dividerAccent: 0x9dff6c,
} as const;
