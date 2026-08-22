import Phaser from 'phaser';
import { getFullscreenHost } from './FullscreenController';

/**
 * TEMPORARY dev-only viewport diagnostic. Enable with `?viewportDebug=1`.
 *
 * Exists to locate the black side gutters seen in mobile landscape, by
 * splitting the possibilities apart rather than guessing:
 *
 *  1. Outside the canvas — the canvas is smaller than #game. The page and
 *     #game are painted DEBUG_PAGE (magenta) here, so any gutter that is
 *     outside the canvas shows up magenta instead of black.
 *  2. Inside the canvas but outside the camera viewport — nothing magenta,
 *     but `canvas rect` matches `#game rect` while `camera` is narrower than
 *     `gameSize`. The gutter would be painted with the *game config*
 *     background (#10091d), not the scene camera's own colour.
 *  3. Inside the camera, i.e. scene/background coverage — everything below
 *     agrees and the camera covers the canvas; the gap is then the scene's
 *     own art not reaching the edge.
 *
 * Reads only. It never writes to the Scale Manager, a camera, or any scene,
 * so scaling, layout and gameplay behave exactly as they do without it.
 * Gated behind `import.meta.env.DEV`, so it is dropped from production.
 */

/** Deliberately loud, and nothing like the near-black the game paints. */
const DEBUG_PAGE = '#ff00ff';
/** Only ever visible if the canvas were transparent; a second distinct signal. */
const DEBUG_CANVAS = '#00ffff';

export function isViewportDebugEnabled(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('viewportDebug') === '1';
}

function formatRect(rect: DOMRect): string {
  const round = (value: number): string => value.toFixed(1);
  return `x ${round(rect.x)}  y ${round(rect.y)}  ${round(rect.width)} x ${round(rect.height)}`;
}

export function setupViewportDebug(game: Phaser.Game): void {
  if (!isViewportDebugEnabled()) return;

  const host = getFullscreenHost();
  // Loud page colour so a gutter outside the canvas cannot be mistaken for
  // the game's own near-black background.
  document.documentElement.style.background = DEBUG_PAGE;
  document.body.style.background = DEBUG_PAGE;
  host.style.background = DEBUG_PAGE;

  const panel = document.createElement('div');
  panel.setAttribute('data-viewport-debug', '');
  // Fixed and non-interactive: it must not intercept a tap or change layout.
  panel.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'z-index: 2147483647',
    'pointer-events: none',
    'font: 11px/1.35 "Space Mono", monospace',
    'white-space: pre',
    'color: #fff',
    'background: rgba(0, 0, 0, 0.82)',
    'padding: 6px 8px',
    'max-width: 100vw',
    'overflow: hidden',
  ].join(';');
  document.body.append(panel);

  const render = (): void => {
    const canvas = game.canvas as HTMLCanvasElement | undefined;
    if (canvas) canvas.style.background = DEBUG_CANVAS;

    const viewport = window.visualViewport;
    const scale = game.scale;
    const camera = game.scene.getScenes(true)[0]?.cameras?.main;
    const activeScenes = game.scene.getScenes(true).map((scene) => scene.scene.key);
    // In EXPAND this is the canvas's CSS size, i.e. what should equal #game.
    const displaySize = scale.displaySize;

    panel.textContent = [
      `VIEWPORT DEBUG   scene: ${activeScenes.join(', ') || '-'}`,
      `window.inner        ${window.innerWidth} x ${window.innerHeight}`,
      `visualViewport      ${viewport ? `${viewport.width.toFixed(1)} x ${viewport.height.toFixed(1)}  off ${viewport.offsetLeft.toFixed(1)},${viewport.offsetTop.toFixed(1)}  scale ${viewport.scale}` : 'n/a'}`,
      `#game rect          ${formatRect(host.getBoundingClientRect())}`,
      `canvas rect         ${canvas ? formatRect(canvas.getBoundingClientRect()) : 'n/a'}`,
      `canvas attr w/h     ${canvas ? `${canvas.width} x ${canvas.height}` : 'n/a'}`,
      `canvas style w/h    ${canvas ? `${canvas.style.width || '-'} x ${canvas.style.height || '-'}` : 'n/a'}`,
      `scale.parentSize    ${scale.parentSize.width.toFixed(1)} x ${scale.parentSize.height.toFixed(1)}`,
      `scale.gameSize      ${scale.gameSize.width.toFixed(1)} x ${scale.gameSize.height.toFixed(1)}`,
      `scale.displaySize   ${displaySize ? `${displaySize.width.toFixed(1)} x ${displaySize.height.toFixed(1)}` : 'n/a'}`,
      `scale.zoom / mode   ${scale.zoom}  /  ${scale.scaleMode}`,
      `camera              ${camera ? `x ${camera.x.toFixed(1)}  y ${camera.y.toFixed(1)}  ${camera.width.toFixed(1)} x ${camera.height.toFixed(1)}` : 'n/a'}`,
      `devicePixelRatio    ${window.devicePixelRatio}`,
      `fullscreen          ${scale.isFullscreen ? 'yes' : 'no'}  (available: ${scale.fullscreen.available ? 'yes' : 'no'})`,
      '',
      'magenta gutter = outside canvas | black gutter = inside canvas',
    ].join('\n');

    window.requestAnimationFrame(render);
  };

  window.requestAnimationFrame(render);
  console.info('[viewportDebug] enabled; page painted magenta, canvas CSS background cyan.');
}
