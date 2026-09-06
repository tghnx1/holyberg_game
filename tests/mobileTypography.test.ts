import { describe, expect, it } from 'vitest';
import { dialogueBodyTextWidth, dialogueBottomBarHeight, estimateWrappedLineCount } from '../src/game/dialogue/dialogueLayoutMetrics';
import { DialogueLayout } from '../src/game/dialogue/dialogueConstants';
import { calculateExpandedLogicalSize, createViewportInfo } from '../src/game/responsive/ResponsiveLayout';
import { getUiTypography, responsiveFontSize } from '../src/game/ui/mobileTypography';

describe('mobile typography', () => {
  const iphone15Landscape = createViewportInfo(852, 393, true);

  it('increases body and button copy on an iPhone 15 Pro landscape viewport', () => {
    const profile = getUiTypography(iphone15Landscape);
    expect(profile.compactPhone).toBe(true);
    expect(profile.dialogueBody).toBeGreaterThan(getUiTypography().dialogueBody);
    expect(responsiveFontSize(18, iphone15Landscape, 'body')).toBeGreaterThan(18);
    expect(responsiveFontSize(24, iphone15Landscape, 'button')).toBeGreaterThan(24);
  });

  it('keeps desktop typography unchanged', () => {
    const desktop = createViewportInfo(1440, 900, false);
    expect(getUiTypography(desktop).compactPhone).toBe(false);
    expect(responsiveFontSize(18, desktop, 'body')).toBe(18);
    expect(responsiveFontSize(24, desktop, 'button')).toBe(24);
  });

  it('reserves enough bottom-bar height for a deliberately long wrapped dialogue line', () => {
    const logical = calculateExpandedLogicalSize(852, 393);
    const profile = getUiTypography(iphone15Landscape);
    const wrapWidth = dialogueBodyTextWidth(logical.width);
    const longLine =
      'The portal is behind the decks, but first cross the entire room and speak to the bartender, then come back when the lights change and the crowd opens a safe path for you.';
    const wrappedLines = estimateWrappedLineCount(longLine, wrapWidth, profile.dialogueBody);
    const barHeight = dialogueBottomBarHeight({
      viewportHeight: logical.height,
      wrapWidth,
      fontSize: profile.dialogueBody,
      lineSpacing: 7,
      lines: [longLine],
      compactPhone: true,
    });
    const bodyBottom = DialogueLayout.textOffsetY + wrappedLines * (profile.dialogueBody + 7);

    expect(wrappedLines).toBeGreaterThan(1);
    expect(bodyBottom).toBeLessThanOrEqual(barHeight - 38);
  });
});
