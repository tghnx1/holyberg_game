import Phaser from 'phaser';
import { getFullscreenHost } from './FullscreenController';

/**
 * Keeps Phaser's parent size equal to the element the canvas actually lives
 * in, and the main camera's viewport in sync with the resulting game size.
 * Scale.EXPAND is left in place — this only feeds it the right dimensions.
 *
 * The host (`#game`) is `position: fixed; inset: 0; width: 100vw; height:
 * 100dvh`, so its own box already *is* the space the canvas has to fill. It
 * is therefore the only correct source of truth here.
 *
 * `visualViewport` is deliberately not used for measurement. It reports the
 * area currently visible to the user, which on some mobile landscape browsers
 * is narrower than `100vw` while browser chrome is on screen. Feeding that
 * narrower width to the Scale Manager made EXPAND compute a canvas smaller
 * than the host, and CENTER_BOTH then centred it — the black gutters down
 * both sides. It remains a useful *trigger*, since it fires on chrome
 * show/hide when `window.resize` does not.
 */
function measureHost(): { width: number; height: number } {
  const host = getFullscreenHost();
  // Fractional and layout-accurate, including while a fullscreen transition
  // is still settling; clientWidth/Height are the integer fallback.
  const rect = host.getBoundingClientRect();
  const width = rect.width || host.clientWidth;
  const height = rect.height || host.clientHeight;
  if (width > 0 && height > 0) return { width, height };
  // Only before the host has been laid out at all.
  return { width: window.innerWidth, height: window.innerHeight };
}

export function setupFullscreenResize(game: Phaser.Game): void {
  const apply = (): void => {
    const { width, height } = measureHost();
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
  game.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, applyNow);
  game.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, applyNow);
  game.events.once(Phaser.Core.Events.READY, applyNow);
}
