import Phaser from 'phaser';
import { Depth } from '../constants';
import { getViewportInfo } from './ResponsiveLayout';

/**
 * Fullscreen lifecycle for the whole game: entering from a user gesture,
 * best-effort landscape locking, and a small exit control that any scene can
 * attach. Resizing stays in FullscreenResize; this only reacts to Phaser's
 * fullscreen events.
 */

/** The element Phaser makes fullscreen; also where the portrait overlay goes. */
export function getFullscreenHost(): HTMLElement {
  return document.getElementById('game') ?? document.body;
}

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

function orientationApi(): LockableOrientation | undefined {
  return typeof screen === 'undefined' ? undefined : (screen.orientation as LockableOrientation);
}

/**
 * Best effort only, and deliberately not awaited: a rejected lock (iOS, or a
 * desktop browser) must never delay or block gameplay. The portrait overlay
 * remains the real fallback.
 */
function lockLandscape(): void {
  const orientation = orientationApi();
  if (!orientation?.lock) return;
  orientation.lock('landscape').catch((error: unknown) => {
    if (import.meta.env.DEV) console.debug('[Fullscreen] orientation lock unavailable', error);
  });
}

function unlockOrientation(): void {
  const orientation = orientationApi();
  try {
    orientation?.unlock?.();
  } catch (error) {
    if (import.meta.env.DEV) console.debug('[Fullscreen] orientation unlock failed', error);
  }
}

/**
 * Requests fullscreen for #game. Must be called from within a user gesture —
 * on touch that means `pointerup`, since browsers reject the request from a
 * `pointerdown` that has not completed.
 */
export function requestGameFullscreen(scene: Phaser.Scene): void {
  const scale = scene.scale;
  if (!scale.fullscreen.available || scale.isFullscreen) return;
  scale.startFullscreen();
}

/**
 * Small always-available exit affordance, shown only while fullscreen. Each
 * scene attaches its own, so it survives scene transitions; it sits above the
 * gameplay input zones so tapping it cannot jump, duck or hit a rhythm lane.
 */
export function attachFullscreenExitControl(scene: Phaser.Scene): void {
  if (!scene.scale.fullscreen.available) return;

  const button = scene.add
    .text(0, 0, '✕', {
      fontFamily: 'Space Mono',
      fontSize: '20px',
      color: '#ffdd57',
      backgroundColor: '#23132fdd',
      // Padding is the touch target: small mark, finger-sized hit area.
      padding: { x: 14, y: 10 },
    })
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(Depth.UI + 50)
    .setVisible(scene.scale.isFullscreen)
    .setInteractive({ useHandCursor: true });

  const place = (): void => {
    const margin = getViewportInfo(scene.scale).safeMargin;
    button.setPosition(scene.cameras.main.width - margin, margin);
  };

  const onDown = (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData): void => {
    // Stop the press reaching the jump zone or a rhythm lane underneath.
    event.stopPropagation();
    pointer.event?.preventDefault();
    scene.scale.stopFullscreen();
  };
  const onEnter = (): void => {
    button.setVisible(true);
    place();
  };
  const onLeave = (): void => {
    button.setVisible(false);
  };
  const onResize = (): void => place();

  button.on('pointerdown', onDown);
  scene.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, onEnter);
  scene.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, onLeave);
  scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
  place();

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    button.off('pointerdown', onDown);
    scene.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, onEnter);
    scene.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, onLeave);
    scene.scale.off(Phaser.Scale.Events.RESIZE, onResize);
    button.destroy();
  });
}

/** Installed once from main: game-wide fullscreen event handling. */
export function installFullscreenLifecycle(game: Phaser.Game): void {
  const scale = game.scale;
  scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, () => {
    if (import.meta.env.DEV) console.debug('[Fullscreen] entered');
    lockLandscape();
  });
  scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, () => {
    if (import.meta.env.DEV) console.debug('[Fullscreen] left');
    unlockOrientation();
  });
  scale.on(Phaser.Scale.Events.FULLSCREEN_FAILED, (error: unknown) => {
    console.warn('[Fullscreen] request failed; continuing windowed', error);
  });
  scale.on(Phaser.Scale.Events.FULLSCREEN_UNSUPPORTED, () => {
    console.warn('[Fullscreen] unsupported on this device; continuing windowed');
  });
}
