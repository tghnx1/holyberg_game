import Phaser from 'phaser';
import { getFullscreenHost } from './FullscreenController';
import { getViewportInfo } from './ResponsiveLayout';
import type { ViewportInfo } from './ViewportInfo';

interface OrientationCallbacks {
  onPause?: () => void;
  onResume?: () => void;
  onLayout?: (viewport: ViewportInfo) => void;
}

export class OrientationController {
  private overlay?: HTMLDivElement;
  private portrait = false;
  private readonly resizeHandler = () => this.refresh();

  constructor(private readonly scene: Phaser.Scene, private readonly callbacks: OrientationCallbacks = {}) {
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.resizeHandler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.refresh();
  }

  refresh(): void {
    const viewport = getViewportInfo(this.scene.scale);
    if (import.meta.env.DEV) {
      console.debug('[Orientation]', {
        scene: this.scene.scene.key,
        width: viewport.physicalWidth,
        height: viewport.physicalHeight,
        portrait: viewport.portrait,
        fullscreen: this.scene.scale.isFullscreen,
        scenePaused: this.scene.scene.isPaused(),
      });
    }
    // A zero or absent measurement is not an orientation. Acting on one would
    // latch the scene paused on the frame it was created, and recovery would
    // depend on a later RESIZE that may never arrive.
    if (viewport.physicalWidth <= 0 || viewport.physicalHeight <= 0) return;
    this.callbacks.onLayout?.(viewport);
    if (viewport.portrait === this.portrait) return;
    this.portrait = viewport.portrait;
    if (this.portrait) this.enterPortrait();
    else this.leavePortrait();
  }

  private enterPortrait(): void {
    this.callbacks.onPause?.();
    this.scene.scene.pause();
    const overlay = document.createElement('div');
    overlay.className = 'orientation-overlay';
    overlay.setAttribute('role', 'status');
    const phone = document.createElement('div');
    phone.className = 'orientation-phone';
    const title = document.createElement('div');
    title.textContent = 'ROTATE YOUR PHONE';
    const subtitle = document.createElement('div');
    subtitle.className = 'orientation-subtitle';
    subtitle.textContent = 'HOLYBERG PLAYS BEST IN LANDSCAPE';
    overlay.append(phone, title, subtitle);
    // Inside the fullscreen host, not document.body: only the fullscreen
    // element's subtree renders, so a sibling overlay would be invisible and
    // the pause would look like a frozen canvas.
    getFullscreenHost().append(overlay);
    this.overlay = overlay;
  }

  private leavePortrait(): void {
    this.overlay?.remove();
    this.overlay = undefined;
    this.callbacks.onResume?.();
    this.scene.scene.resume();
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.resizeHandler);
    this.overlay?.remove();
  }
}

