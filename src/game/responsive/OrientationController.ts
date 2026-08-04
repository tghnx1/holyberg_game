import Phaser from 'phaser';
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
    document.body.append(overlay);
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

export function addFullscreenButton(scene: Phaser.Scene): Phaser.GameObjects.Text | undefined {
  if (!scene.scale.fullscreen.available) return undefined;
  const button = scene.add.text(0, 0, 'FULLSCREEN', { fontFamily: 'Space Mono', fontSize: '15px', color: '#ffdd57', backgroundColor: '#23132f', padding: { x: 12, y: 8 } }).setOrigin(0.5).setInteractive();
  button.on('pointerdown', () => { if (scene.scale.isFullscreen) scene.scale.stopFullscreen(); else scene.scale.startFullscreen(); });
  return button;
}
