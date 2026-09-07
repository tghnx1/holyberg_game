import Phaser from 'phaser';
import { getFullscreenHost } from './FullscreenController';
import { getViewportInfo } from './ResponsiveLayout';
import { getOrientationOverlayMode } from './OrientationOverlay';
import type { ViewportInfo } from './ViewportInfo';

interface OrientationCallbacks {
  onPause?: () => void;
  onResume?: () => void;
  onLayout?: (viewport: ViewportInfo) => void;
}

/**
 * True while a text field (or a contenteditable) actually has focus.
 *
 * Checked by tag name/type string rather than `instanceof HTMLInputElement`
 * etc., so this stays callable with no `document` at all — this class also
 * runs under plain unit tests with no DOM.
 */
function isTextInputFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement as (Element & { type?: string; isContentEditable?: boolean }) | null;
  if (!active) return false;
  if (active.tagName === 'TEXTAREA') return true;
  if (active.tagName === 'INPUT') {
    // Only text-entry types; a focused checkbox/radio/button/range etc. is
    // not something the on-screen keyboard opens for.
    const textTypes = new Set(['text', 'search', 'email', 'tel', 'url', 'password', 'number']);
    return textTypes.has(active.type ?? 'text');
  }
  return active.isContentEditable === true;
}

export class OrientationController {
  private overlay?: HTMLDivElement;
  private portrait = false;
  private portraitSinceMs = 0;
  private rotationHintTimer?: number;
  private overlayMode: 'game' | 'instagram' | 'rotate' | 'rotate-with-hint' = 'game';
  private readonly resizeHandler = () => this.refresh();

  constructor(private readonly scene: Phaser.Scene, private readonly callbacks: OrientationCallbacks = {}) {
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.resizeHandler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.refresh();
  }

  refresh(): void {
    // Opening the on-screen keyboard shrinks the layout viewport on many
    // mobile browsers (notably Android Chrome), which fires the exact same
    // Scale.Events.RESIZE this listens for. Acting on that resize while a
    // text field has focus — e.g. the leaderboard claim modal's Instagram
    // input — would pause the scene and raise the "ROTATE YOUR PHONE"
    // overlay (z-index above that modal) mid-keystroke, stealing focus and
    // cutting typing short. It is never a real rotation, so it is ignored
    // outright; a real rotation re-fires RESIZE once the field blurs anyway.
    if (isTextInputFocused()) return;
    const viewport = getViewportInfo(this.scene.scale);
    // A zero or absent measurement is not an orientation. Acting on one would
    // latch the scene paused on the frame it was created, and recovery would
    // depend on a later RESIZE that may never arrive.
    if (viewport.physicalWidth <= 0 || viewport.physicalHeight <= 0) return;
    this.callbacks.onLayout?.(viewport);
    if (viewport.portrait !== this.portrait) {
      this.portrait = viewport.portrait;
      if (this.portrait) this.enterPortrait();
      else this.leavePortrait();
      return;
    }
    if (!this.portrait) return;
    this.updateOverlay();
  }

  private enterPortrait(): void {
    this.callbacks.onPause?.();
    this.scene.scene.pause();
    this.portraitSinceMs = performance.now();
    this.updateOverlay();
    this.scheduleHintRefresh();
  }

  private updateOverlay(): void {
    const viewport = getViewportInfo(this.scene.scale);
    const mode = getOrientationOverlayMode({
      portrait: viewport.portrait,
      touchOriented: viewport.touchOriented,
      userAgent: navigator.userAgent,
      portraitElapsedMs: performance.now() - this.portraitSinceMs,
    });
    if (mode === this.overlayMode) return;
    this.overlayMode = mode;
    this.overlay?.remove();
    this.overlay = undefined;
    if (mode === 'game') return;

    const overlay = document.createElement('div');
    overlay.className = 'orientation-overlay';
    overlay.setAttribute('role', 'status');
    const title = document.createElement('div');
    const subtitle = document.createElement('div');
    subtitle.className = 'orientation-subtitle';

    if (mode === 'instagram') {
      title.innerHTML = 'OPEN IN BROWSER<br>TO PLAY IN LANDSCAPE';
      subtitle.textContent = 'Tap ⋯ and choose “Open in browser”';
    } else {
      const phone = document.createElement('div');
      phone.className = 'orientation-phone';
      title.textContent = mode === 'rotate-with-hint' ? 'STILL NOT ROTATING?' : 'ROTATE YOUR PHONE';
      subtitle.textContent =
        mode === 'rotate-with-hint'
          ? 'TURN OFF ROTATION LOCK'
          : 'HOLYWORLD PLAYS BEST IN LANDSCAPE';
      overlay.append(phone);
    }
    overlay.append(title, subtitle);
    getFullscreenHost().append(overlay);
    this.overlay = overlay;
  }

  private scheduleHintRefresh(): void {
    this.clearHintTimer();
    this.rotationHintTimer = window.setTimeout(() => {
      this.updateOverlay();
    }, 3000);
  }

  private clearHintTimer(): void {
    if (this.rotationHintTimer === undefined) return;
    window.clearTimeout(this.rotationHintTimer);
    this.rotationHintTimer = undefined;
  }

  private leavePortrait(): void {
    this.clearHintTimer();
    this.overlay?.remove();
    this.overlay = undefined;
    this.overlayMode = 'game';
    this.callbacks.onResume?.();
    this.scene.scene.resume();
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.resizeHandler);
    this.clearHintTimer();
    this.overlay?.remove();
  }
}
