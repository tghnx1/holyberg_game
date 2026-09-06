import Phaser from 'phaser';
import { getFullscreenHost } from './FullscreenController';
import { resolveGameHostViewport } from './visibleViewportLayout';

/**
 * Keeps Phaser's parent size equal to the element the canvas actually lives
 * in, and the main camera's viewport in sync with the resulting game size.
 * Scale.EXPAND is left in place — this only feeds it the right dimensions.
 *
 * Width always comes from the host (`100vw`) so Scale.EXPAND keeps the
 * wide-screen composition and never reintroduces side gutters. Windowed iOS
 * Safari is the narrow exception for height: its browser chrome can move the
 * visible viewport without making `100dvh`/the host follow reliably, so only
 * the live visual height and vertical offset are applied there.
 */
function measureHost(fullscreen: boolean): { width: number; height: number } {
  const host = getFullscreenHost();
  // Fractional and layout-accurate, including while a fullscreen transition
  // is still settling; clientWidth/Height are the integer fallback.
  const rect = host.getBoundingClientRect();
  const visualViewport = window.visualViewport;
  const layout = resolveGameHostViewport({
    hostWidth: rect.width || host.clientWidth,
    hostHeight: rect.height || host.clientHeight,
    fallbackWidth: window.innerWidth,
    fallbackHeight: window.innerHeight,
    userAgent: navigator.userAgent,
    fullscreen,
    visualViewport: visualViewport
      ? { height: visualViewport.height, offsetTop: visualViewport.offsetTop }
      : undefined,
  });

  if (layout.usesVisibleViewportHeight) {
    host.style.top = `${layout.top}px`;
    host.style.bottom = 'auto';
    host.style.height = `${layout.height}px`;
  } else {
    host.style.removeProperty('top');
    host.style.removeProperty('bottom');
    host.style.removeProperty('height');
  }

  return { width: layout.width, height: layout.height };
}

export function setupFullscreenResize(game: Phaser.Game): void {
  const apply = (): void => {
    const { width, height } = measureHost(game.scale.isFullscreen);
    if (width <= 0 || height <= 0) return;
    game.scale.setParentSize(width, height);
    const gameWidth = game.scale.gameSize.width;
    const gameHeight = game.scale.gameSize.height;
    game.scene.getScenes(true).forEach((scene) => {
      scene.cameras.main.setSize(gameWidth, gameHeight);
    });
  };

  // Orientation and fullscreen changes fire before the new layout has been
  // committed, so the element would still measure at its old size. Measuring
  // again on the next frame catches the settled box; the immediate pass keeps
  // the common case (a plain resize) from waiting a frame.
  let queued = 0;
  const applyNow = (): void => {
    apply();
    if (queued) cancelAnimationFrame(queued);
    queued = requestAnimationFrame(() => {
      queued = 0;
      apply();
    });
  };

  window.addEventListener('resize', applyNow);
  window.addEventListener('orientationchange', applyNow);
  window.visualViewport?.addEventListener('resize', applyNow);
  window.visualViewport?.addEventListener('scroll', applyNow);
  game.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, applyNow);
  game.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, applyNow);
  game.events.once(Phaser.Core.Events.READY, applyNow);
}
