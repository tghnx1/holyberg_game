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
 * browsers are the exception for height: their browser chrome can move the
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

const keyboardGuardReleases = new Set<() => void>();

/** Call when a focused DOM input is removed without dispatching focusout. */
export function releaseKeyboardResizeGuard(): void {
  for (const release of keyboardGuardReleases) release();
}

export function setupFullscreenResize(game: Phaser.Game): void {
  let keyboardFocused = false;
  let lastApplied: { width: number; height: number } | undefined;
  let settleFrame = 0;
  let lastSample: { width: number; height: number } | undefined;
  let stableSamples = 0;

  const isTextEntry = (target: EventTarget | null): target is HTMLElement => {
    if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
    const element = target as HTMLElement & { type?: string; isContentEditable?: boolean };
    if (element.tagName === 'TEXTAREA' || element.isContentEditable) return true;
    return element.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file'].includes(element.type ?? 'text');
  };

  const refreshKeyboardFocus = (): boolean => {
    const active = document.activeElement;
    keyboardFocused = isTextEntry(active) && getFullscreenHost().contains(active);
    return keyboardFocused;
  };

  const apply = (): void => {
    if (keyboardFocused) return;
    const { width, height } = measureHost(game.scale.isFullscreen);
    if (width <= 0 || height <= 0) return;
    if (lastApplied?.width === width && lastApplied.height === height) return;
    lastApplied = { width, height };
    game.scale.setParentSize(width, height);
    const gameWidth = game.scale.gameSize.width;
    const gameHeight = game.scale.gameSize.height;
    game.scene.getScenes(true).forEach((scene) => {
      scene.cameras.main.setSize(gameWidth, gameHeight);
    });
  };

  // During keyboard close iOS emits several heights (for example 180, 240,
  // 320, 390). Require two identical animation-frame samples before applying
  // the final size, so Phaser never renders an intermediate keyboard height.
  const scheduleApply = (released = false): void => {
    if (!released && refreshKeyboardFocus()) return;
    if (settleFrame) return;
    lastSample = undefined;
    stableSamples = 0;
    const sample = (): void => {
      settleFrame = 0;
      if (refreshKeyboardFocus()) return;
      const current = measureHost(game.scale.isFullscreen);
      if (lastSample?.width === current.width && lastSample.height === current.height) stableSamples += 1;
      else stableSamples = 1;
      lastSample = current;
      if (stableSamples >= 2) {
        apply();
        return;
      }
      settleFrame = requestAnimationFrame(sample);
    };
    settleFrame = requestAnimationFrame(sample);
  };

  const onFocusIn = (event: FocusEvent): void => {
    if (isTextEntry(event.target) && getFullscreenHost().contains(event.target)) keyboardFocused = true;
  };
  const onFocusOut = (event: FocusEvent): void => {
    if (!isTextEntry(event.target) || !getFullscreenHost().contains(event.target)) return;
    // A focus handoff between fields must keep the keyboard guard active.
    if (isTextEntry(event.relatedTarget) && getFullscreenHost().contains(event.relatedTarget)) return;
    keyboardFocused = false;
    scheduleApply();
  };
  const release = (): void => {
    keyboardFocused = false;
    // The caller may invoke this before removing the DOM node; do not inspect
    // activeElement again until the node has actually disappeared.
    scheduleApply(true);
  };
  keyboardGuardReleases.add(release);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);

  const onViewportChange = (): void => scheduleApply();
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);
  window.visualViewport?.addEventListener('resize', onViewportChange);
  window.visualViewport?.addEventListener('scroll', onViewportChange);
  game.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, onViewportChange);
  game.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, onViewportChange);
  game.events.once(Phaser.Core.Events.READY, onViewportChange);
}
