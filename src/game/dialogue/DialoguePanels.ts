import Phaser from 'phaser';
import { DIALOGUE_TIMING } from './dialogueTiming';

export interface SlidingPanel {
  target: Phaser.GameObjects.Container;
  /** Where the panel rests once it has slid in. */
  restX: number;
  restY: number;
  /** Where it sits off-screen, before sliding in and after sliding out. */
  offX: number;
  offY: number;
}

/**
 * Drives the four panels of the composition as one unit.
 *
 * All four move together — top bar from the top, bottom bar from the bottom,
 * scene from the left, portrait from the right — and there is deliberately no
 * fade: the panels are opaque and simply arrive.
 */
export class DialoguePanels {
  private readonly panels: SlidingPanel[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  add(panel: SlidingPanel): void {
    panel.target.setPosition(panel.offX, panel.offY);
    this.panels.push(panel);
  }

  /** Snaps every panel off-screen without animating. */
  reset(): void {
    for (const panel of this.panels) panel.target.setPosition(panel.offX, panel.offY);
  }

  slideIn(onComplete?: () => void): void {
    this.slide('in', onComplete);
  }

  slideOut(onComplete?: () => void): void {
    this.slide('out', onComplete);
  }

  private slide(direction: 'in' | 'out', onComplete?: () => void): void {
    let remaining = this.panels.length;
    if (remaining === 0) {
      onComplete?.();
      return;
    }
    for (const panel of this.panels) {
      this.scene.tweens.add({
        targets: panel.target,
        x: direction === 'in' ? panel.restX : panel.offX,
        y: direction === 'in' ? panel.restY : panel.offY,
        duration: DIALOGUE_TIMING.slideMs,
        // Sharp arrival, sharp exit: no easing softness, matching the style.
        ease: direction === 'in' ? 'Quint.easeOut' : 'Quint.easeIn',
        onComplete: () => {
          remaining -= 1;
          if (remaining === 0) onComplete?.();
        },
      });
    }
  }
}
