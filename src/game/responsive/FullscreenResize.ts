import Phaser from 'phaser';

/**
 * Drives Phaser's size from the actual visual viewport instead of relying on
 * the Scale Manager's own DOM-measured parentSize, which can lag or mismatch
 * on mobile (browser chrome show/hide, dynamic viewport units) and leave a
 * stray strip of unfilled space. Scale.EXPAND is left in place — this only
 * feeds it the correct parent dimensions and keeps the main camera's
 * viewport in sync with the resulting game size.
 */
function measureViewport(): { width: number; height: number } {
  const viewport = window.visualViewport;
  if (viewport) return { width: viewport.width, height: viewport.height };
  return { width: window.innerWidth, height: window.innerHeight };
}

export function setupFullscreenResize(game: Phaser.Game): void {
  const apply = (): void => {
    const { width, height } = measureViewport();
    if (width <= 0 || height <= 0) return;
    game.scale.setParentSize(width, height);
    const gameWidth = game.scale.gameSize.width;
    const gameHeight = game.scale.gameSize.height;
    game.scene.getScenes(true).forEach((scene) => {
      scene.cameras.main.setSize(gameWidth, gameHeight);
    });
  };

  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  window.visualViewport?.addEventListener('resize', apply);
  game.events.once(Phaser.Core.Events.READY, apply);
}
