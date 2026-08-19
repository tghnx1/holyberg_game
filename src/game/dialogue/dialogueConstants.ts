/** Layout and palette for the Hotline Miami-style dialogue presentation. */

export const DialogueDepth = {
  SCENE: 10,
  PORTRAIT: 20,
  BARS: 40,
  TEXT: 50,
  GLITCH: 60,
  SKIP: 70,
} as const;

export const DialogueLayout = {
  /** Full-width black bars that frame the composition. */
  topBarHeight: 118,
  bottomBarHeight: 214,
  /** Fraction of the width taken by the left-hand scene panel. */
  scenePanelWidthRatio: 0.56,
  textPaddingX: 56,
  speakerOffsetY: 26,
  textOffsetY: 70,
} as const;

export const DialoguePalette = {
  bar: 0x000000,
  speaker: '#ff477e',
  text: '#ffffff',
  skipHint: '#8a7fa0',
  glitch: 0xffffff,
} as const;
