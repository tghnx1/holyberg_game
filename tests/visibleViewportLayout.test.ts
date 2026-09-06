import { describe, expect, it } from 'vitest';
import {
  isWindowedIosSafari,
  resolveGameHostViewport,
} from '../src/game/responsive/visibleViewportLayout';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

describe('visible viewport layout', () => {
  it('uses iPhone Safari visible height and vertical offset without changing host width', () => {
    expect(
      resolveGameHostViewport({
        hostWidth: 852,
        hostHeight: 430,
        fallbackWidth: 852,
        fallbackHeight: 393,
        userAgent: IPHONE_SAFARI,
        fullscreen: false,
        visualViewport: { height: 393, offsetTop: 18 },
      }),
    ).toEqual({ width: 852, height: 393, top: 18, usesVisibleViewportHeight: true });
  });

  it('uses the fullscreen host normally on iPhone Safari', () => {
    expect(isWindowedIosSafari(IPHONE_SAFARI, true)).toBe(false);
    expect(
      resolveGameHostViewport({
        hostWidth: 852,
        hostHeight: 393,
        fallbackWidth: 852,
        fallbackHeight: 393,
        userAgent: IPHONE_SAFARI,
        fullscreen: true,
        visualViewport: { height: 360, offsetTop: 20 },
      }),
    ).toEqual({ width: 852, height: 393, top: 0, usesVisibleViewportHeight: false });
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
