import { describe, expect, it } from 'vitest';
import { getOrientationOverlayMode, isInstagramInAppBrowser } from '../src/game/responsive/OrientationOverlay';

describe('orientation overlay selection', () => {
  it('detects Instagram in-app browser user agents', () => {
    expect(isInstagramInAppBrowser('Mozilla/5.0 Instagram 123')).toBe(true);
    expect(isInstagramInAppBrowser('Mozilla/5.0 Safari/605.1.15')).toBe(false);
  });

  it('shows the Instagram overlay before any rotate overlay', () => {
    expect(
      getOrientationOverlayMode({
        portrait: true,
        touchOriented: true,
        userAgent: 'Mozilla/5.0 Instagram 123',
        portraitElapsedMs: 0,
      }),
    ).toBe('instagram');
  });

  it('shows the normal rotate overlay for mobile portrait', () => {
    expect(
      getOrientationOverlayMode({
        portrait: true,
        touchOriented: true,
        userAgent: 'Mozilla/5.0 Safari/605.1.15',
        portraitElapsedMs: 0,
      }),
    ).toBe('rotate');
  });

  it('adds the rotation-lock hint after the delay', () => {
    expect(
      getOrientationOverlayMode({
        portrait: true,
        touchOriented: true,
        userAgent: 'Mozilla/5.0 Safari/605.1.15',
        portraitElapsedMs: 3000,
      }),
    ).toBe('rotate-with-hint');
  });

  it('hides the overlay in landscape', () => {
    expect(
      getOrientationOverlayMode({
        portrait: false,
        touchOriented: true,
        userAgent: 'Mozilla/5.0 Safari/605.1.15',
        portraitElapsedMs: 3000,
      }),
    ).toBe('game');
  });

  it('hides the mobile overlay on desktop', () => {
    expect(
      getOrientationOverlayMode({
        portrait: true,
        touchOriented: false,
        userAgent: 'Mozilla/5.0 Safari/605.1.15',
        portraitElapsedMs: 3000,
      }),
    ).toBe('game');
  });
});
