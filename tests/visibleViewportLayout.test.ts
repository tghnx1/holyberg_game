import { describe, expect, it } from 'vitest';
import {
  isWindowedIosBrowser,
  resolveGameHostViewport,
} from '../src/game/responsive/visibleViewportLayout';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

const IOS_BROWSERS = [
  IPHONE_SAFARI,
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/128.0.0.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 FxiOS/130.0 Mobile/15E148 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 EdgiOS/128.0 Mobile/15E148 Safari/605.1.15',
];

describe('visible viewport layout', () => {
  it.each(IOS_BROWSERS)('uses the visible height and vertical offset without changing host width: %s', (userAgent) => {
    expect(
      resolveGameHostViewport({
        hostWidth: 852,
        hostHeight: 430,
        fallbackWidth: 852,
        fallbackHeight: 393,
        userAgent,
        fullscreen: false,
        visualViewport: { height: 393, offsetTop: 18 },
      }),
    ).toEqual({ width: 852, height: 393, top: 18, usesVisibleViewportHeight: true });
  });

  it.each(IOS_BROWSERS)('uses the fullscreen host normally: %s', (userAgent) => {
    expect(isWindowedIosBrowser(userAgent, true)).toBe(false);
    expect(
      resolveGameHostViewport({
        hostWidth: 852,
        hostHeight: 393,
        fallbackWidth: 852,
        fallbackHeight: 393,
        userAgent,
        fullscreen: true,
        visualViewport: { height: 360, offsetTop: 20 },
      }),
    ).toEqual({ width: 852, height: 393, top: 0, usesVisibleViewportHeight: false });
  });

  it.each(IOS_BROWSERS)('recovers after the results keyboard closes and browser chrome changes: %s', (userAgent) => {
    let hostHeight = 390;
    for (const visualViewport of [
      { height: 180, offsetTop: 95 },
      { height: 320, offsetTop: 45 },
      { height: 390, offsetTop: 0 },
    ]) {
      const layout = resolveGameHostViewport({
        hostWidth: 844, hostHeight,
        fallbackWidth: 844, fallbackHeight: 390,
        userAgent, fullscreen: false, visualViewport,
      });
      expect(layout.height).toBe(visualViewport.height);
      expect(layout.top).toBe(visualViewport.offsetTop);
      // measureHost writes the height to #game: the next measurement must
      // recover from that inline size, not keep the keyboard's smaller box.
      hostHeight = layout.height;
    }
    expect(hostHeight).toBe(390);
  });

  it('leaves desktop and Android host measurement unchanged', () => {
    for (const userAgent of [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36',
    ]) {
      expect(
        resolveGameHostViewport({
          hostWidth: 1440,
          hostHeight: 900,
          fallbackWidth: 1440,
          fallbackHeight: 900,
          userAgent,
          fullscreen: false,
          visualViewport: { height: 720, offsetTop: 20 },
        }),
      ).toEqual({ width: 1440, height: 900, top: 0, usesVisibleViewportHeight: false });
    }
  });
});
