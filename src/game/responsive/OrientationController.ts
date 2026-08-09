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
          : 'HOLYBERG PLAYS BEST IN LANDSCAPE';
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
