import { describe, expect, it } from 'vitest';
import {
  UI_COLORS,
  UI_FONTS,
  uiBodyStyle,
  uiButtonStyle,
  uiHeadingStyle,
  uiSecondaryStyle,
  uiTextActionStyle,
} from '../src/game/ui/theme';

/** The old menu palette this restyle explicitly replaces. */
const BANNED_HEXES = ['ffdf57', 'ff477e', '9d6cff', 'ff9f43', '55145e', '3a2650', '2b1238'];

describe('UI_COLORS', () => {
  it('contains none of the previous yellow/pink/purple menu colors', () => {
    const values = Object.values(UI_COLORS).map((value) => String(value).toLowerCase());
    for (const banned of BANNED_HEXES) {
      expect(values.some((value) => value.includes(banned))).toBe(false);
    }
  });

  it('pairs every hex-string color with a matching 0xRRGGBB number', () => {
    const pairs: [string, keyof typeof UI_COLORS, keyof typeof UI_COLORS][] = [
      ['background', 'background', 'backgroundNumber'],
      ['panel', 'panel', 'panelNumber'],
      ['panelRaised', 'panelRaised', 'panelRaisedNumber'],
      ['accent', 'accent', 'accentNumber'],
      ['accentBright', 'accentBright', 'accentBrightNumber'],
      ['accentDim', 'accentDim', 'accentDimNumber'],
      ['danger', 'danger', 'dangerNumber'],
    ];
    for (const [, hexKey, numberKey] of pairs) {
      const hex = UI_COLORS[hexKey] as string;
      const number = UI_COLORS[numberKey] as number;
      expect(number).toBe(Number.parseInt(hex.replace('#', ''), 16));
    }
  });

  it('accentBright is a brighter (higher-luminance) green than the base accent', () => {
    // Cheap proxy for "brighter": sum of channel values.
    const luminanceProxy = (hex: number): number =>
      ((hex >> 16) & 0xff) + ((hex >> 8) & 0xff) + (hex & 0xff);
    expect(luminanceProxy(UI_COLORS.accentBrightNumber)).toBeGreaterThan(
      luminanceProxy(UI_COLORS.accentNumber),
    );
  });
});

describe('UI_FONTS', () => {
  it('names the local arcade display font first, with a fallback chain', () => {
    expect(UI_FONTS.display).toContain('Arcade Classic');
    expect(UI_FONTS.display).toContain('Archivo Black');
  });

  it('keeps a monospace body font for readable long-form text', () => {
    expect(UI_FONTS.body.toLowerCase()).toContain('mono');
  });
});

describe('style builders', () => {
  it('uiHeadingStyle uses the display font and the accent green', () => {
    const style = uiHeadingStyle('32px');
    expect(style.fontFamily).toBe(UI_FONTS.display);
    expect(style.fontSize).toBe('32px');
    expect(style.color).toBe(UI_COLORS.accent);
  });

  it('uiBodyStyle/uiSecondaryStyle/uiTextActionStyle use the body font, not the display font', () => {
    for (const style of [uiBodyStyle('16px'), uiSecondaryStyle('16px'), uiTextActionStyle('16px')]) {
      expect(style.fontFamily).toBe(UI_FONTS.body);
    }
  });

  it('uiBodyStyle reads primary text; uiSecondaryStyle/uiTextActionStyle read secondary text', () => {
    expect(uiBodyStyle('16px').color).toBe(UI_COLORS.textPrimary);
    expect(uiSecondaryStyle('16px').color).toBe(UI_COLORS.textSecondary);
    expect(uiTextActionStyle('16px').color).toBe(UI_COLORS.textSecondary);
  });

  it('uiButtonStyle fills with the accent green and sets dark text for contrast', () => {
    const style = uiButtonStyle('18px');
    expect(style.backgroundColor).toBe(UI_COLORS.accent);
    expect(style.color).toBe(UI_COLORS.background);
  });

  it('every builder accepts overrides without losing its other defaults', () => {
    const style = uiHeadingStyle('20px', { color: UI_COLORS.textPrimary });
    expect(style.color).toBe(UI_COLORS.textPrimary);
    expect(style.fontFamily).toBe(UI_FONTS.display);
    expect(style.fontSize).toBe('20px');
  });
});
