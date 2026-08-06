/**
 * Temporary on-device trace. Renders as DOM inside the game host rather than
 * on the canvas, so it still shows when Phaser has stalled and is readable on
 * a phone where the console is not to hand.
 *
 * Not gated on DEV: the failure being chased only reproduces on a deployed
 * build. Remove this module once the Berlin → Rhythm transition is fixed.
 */
let panel: HTMLDivElement | undefined;
const lines: string[] = [];
const started = Date.now();

function host(): HTMLElement {
  return document.getElementById('game') ?? document.body;
}

/**
 * Phaser re-arms requestAnimationFrame *after* calling game.step, so anything
 * that throws inside a step kills the loop for good. Catching it here is the
 * only way to see it on a device with no console.
 */
export function installTraceErrorTrap(): void {
  window.addEventListener('error', (event) => {
    trace(`UNCAUGHT: ${event.message} @ ${event.filename}:${event.lineno}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    trace(`UNHANDLED REJECTION: ${String(event.reason)}`);
  });
}

export function trace(message: string): void {
  const stamp = ((Date.now() - started) / 1000).toFixed(2);
  const line = `${stamp}s ${message}`;
  lines.push(line);
  if (lines.length > 12) lines.shift();
  console.debug(`[trace] ${line}`);

  if (!panel) {
    panel = document.createElement('div');
    panel.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'z-index:20000',
      'max-width:70vw',
      'padding:4px 6px',
      'font:10px/1.35 monospace',
      'color:#7dffb0',
      'background:rgba(0,0,0,.72)',
      'white-space:pre',
      'pointer-events:none',
    ].join(';');
    host().append(panel);
  }
  panel.textContent = lines.join('\n');
}
