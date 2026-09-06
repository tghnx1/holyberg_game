import type Phaser from 'phaser';

/**
 * Shared visual language for every player-facing menu/UI screen (Character
 * Select, dialogue, Pause, Level Complete, Result/Leaderboard, tutorial
 * overlays): the HOLYWORLD poster aesthetic — near-black surfaces, acid
 * neon green accents, white/light-gray readable text, thin green borders
 * and a soft green glow.
 *
 * One module rather than colors/font names hand-typed per scene, so the
 * whole game reads as one system and a future palette tweak is one edit
 * here instead of a hunt through every scene file. Gameplay HUDs (Boss,
 * Rhythm, the in-level Club/Level4 room label) and the dev-only
 * SceneEditor/debug overlay are deliberately not reskinned through this —
 * out of scope for the poster restyle.
 */

export const UI_FONTS = {
  /** Primary headings — the pixel/arcade poster face. Falls back to the previous display font if the local file fails to load. */
  display: '"Arcade Classic", "Archivo Black", sans-serif',
  /** Body copy, buttons, status/score text — unchanged monospace for readability at small sizes. */
  body: '"Space Mono", monospace',
} as const;

/**
 * Hex-string form for Phaser `Text`/CSS colors, and the matching 0xRRGGBB
 * numeric form Phaser `Rectangle`/`Graphics` fills want — kept as one pair
 * per color so the two never drift apart.
 */
export const UI_COLORS = {
  /** Near-black stage background. */
  background: '#060806',
  backgroundNumber: 0x060806,
  /** Dark gray panel surface (leaderboard box, modal, tutorial card, ...). */
  panel: '#12140f',
  panelNumber: 0x12140f,
  /** Slightly lighter dark-gray surface, for a button/row sitting on a panel. */
  panelRaised: '#1b1f18',
  panelRaisedNumber: 0x1b1f18,
  /** Main neon-green accent: borders, headings, primary buttons. */
  accent: '#39ff14',
  accentNumber: 0x39ff14,
  /** Brighter green for a selected/active/hovered state. */
  accentBright: '#aaff33',
  accentBrightNumber: 0xaaff33,
  /** Dim green, for a subtle divider/inactive accent line. */
  accentDim: '#1f7a10',
  accentDimNumber: 0x1f7a10,
  /** Primary readable text — near-white. */
  textPrimary: '#eef5ea',
  /** Secondary/inactive text — light gray. */
  textSecondary: '#93a191',
  /** Validation/error copy; the one deliberate non-green accent, kept for legibility as a warning. */
  danger: '#ff5c5c',
  dangerNumber: 0xff5c5c,
} as const;

export type UiTextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/** A poster-style heading: display font, accent green, dark stroke for a subtle glow-on-black read. */
export function uiHeadingStyle(fontSize: string, overrides: UiTextStyle = {}): UiTextStyle {
  return {
    fontFamily: UI_FONTS.display,
    fontSize,
    color: UI_COLORS.accent,
    stroke: UI_COLORS.background,
    strokeThickness: 6,
    ...overrides,
  };
}

/** Primary readable body copy (breakdown lines, dialogue text, instructions). */
export function uiBodyStyle(fontSize: string, overrides: UiTextStyle = {}): UiTextStyle {
  return {
    fontFamily: UI_FONTS.body,
    fontSize,
    color: UI_COLORS.textPrimary,
    ...overrides,
  };
}

/** Muted status/hint copy — visible but clearly secondary to body text. */
export function uiSecondaryStyle(fontSize: string, overrides: UiTextStyle = {}): UiTextStyle {
  return {
    fontFamily: UI_FONTS.body,
    fontSize,
    color: UI_COLORS.textSecondary,
    ...overrides,
  };
}

/** A filled primary action button: dark text on the accent green fill. */
export function uiButtonStyle(fontSize: string, overrides: UiTextStyle = {}): UiTextStyle {
  return {
    fontFamily: UI_FONTS.body,
    fontSize,
    fontStyle: 'bold',
    color: UI_COLORS.background,
    backgroundColor: UI_COLORS.accent,
    padding: { x: 14, y: 8 },
    ...overrides,
  };
}

/** A quieter, unfilled text action ("Skip", "Retry"), gray at rest and bright green on hover. */
export function uiTextActionStyle(fontSize: string, overrides: UiTextStyle = {}): UiTextStyle {
  return {
    fontFamily: UI_FONTS.body,
    fontSize,
    color: UI_COLORS.textSecondary,
    ...overrides,
  };
}
