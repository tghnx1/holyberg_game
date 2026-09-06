export interface VisualViewportMetrics {
  height: number;
  offsetTop: number;
}

export interface GameHostViewportInput {
  hostWidth: number;
  hostHeight: number;
  fallbackWidth: number;
  fallbackHeight: number;
  userAgent: string;
  fullscreen: boolean;
  visualViewport?: VisualViewportMetrics;
}

export interface GameHostViewportLayout {
  width: number;
  height: number;
  top: number;
  usesVisibleViewportHeight: boolean;
}

/**
 * iOS Safari is the one supported browser where the layout viewport can keep
 * the old `100dvh` box while the actually visible height moves with the
 * collapsing address/tool bars. Width deliberately remains the host width:
 * feeding visualViewport.width into Scale.EXPAND reintroduces side gutters.
 */
export function isWindowedIosSafari(userAgent: string, fullscreen: boolean): boolean {
  if (fullscreen) return false;
  const ios = /iPhone|iPad|iPod/i.test(userAgent);
  const safari = /Safari/i.test(userAgent);
  const anotherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|Instagram/i.test(userAgent);
  return ios && safari && !anotherIosBrowser;
}

export function resolveGameHostViewport(input: GameHostViewportInput): GameHostViewportLayout {
  const width = input.hostWidth > 0 ? input.hostWidth : input.fallbackWidth;
  const hostHeight = input.hostHeight > 0 ? input.hostHeight : input.fallbackHeight;
  const useVisibleHeight =
    isWindowedIosSafari(input.userAgent, input.fullscreen) &&
    input.visualViewport !== undefined &&
    input.visualViewport.height > 0;

  return {
    width,
    height: useVisibleHeight ? input.visualViewport!.height : hostHeight,
    top: useVisibleHeight ? Math.max(0, input.visualViewport!.offsetTop) : 0,
    usesVisibleViewportHeight: useVisibleHeight,
  };
}
