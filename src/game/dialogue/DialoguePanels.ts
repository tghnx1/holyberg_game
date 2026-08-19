import Phaser from 'phaser';
import { DIALOGUE_TIMING } from './dialogueTiming';

export type DialoguePanelId = 'topBar' | 'bottomBar' | 'scene' | 'portrait' | 'divider';

export interface PanelGeometry {
  restX: number;
  restY: number;
  offX: number;
  offY: number;
}

interface SlidingPanel extends PanelGeometry {
  target: Phaser.GameObjects.Container | Phaser.GameObjects.Graphics;
}

/**
 * Drives every panel of the composition as one unit, keyed by id so a resize
 * can update each panel's geometry independently of the slide animation.
 *
 * All panels move together — top bar from the top, bottom bar from the
 * bottom, scene from the left, portrait (and the divider riding with it)
 * from the right — and there is deliberately no fade: panels are opaque and
 * simply arrive.
 */
export class DialoguePanels {
  private readonly panels = new Map<DialoguePanelId, SlidingPanel>();
  /** Whether panels are currently resting at their `rest` position or their `off` one. */
  private state: 'off' | 'in' = 'off';

  constructor(private readonly scene: Phaser.Scene) {}

  add(
    id: DialoguePanelId,
    target: Phaser.GameObjects.Container | Phaser.GameObjects.Graphics,
    geometry: PanelGeometry,
  ): void {
    const panel: SlidingPanel = { target, ...geometry };
    this.panels.set(id, panel);
    target.setPosition(geometry.offX, geometry.offY);
  }

  /**
   * Updates a panel's rest/off geometry after a viewport change and snaps it
   * to wherever the composition currently is. Dialogue only progresses while
   * panels are static, so a resize is always a snap, never a new slide.
   */
  updateGeometry(id: DialoguePanelId, geometry: PanelGeometry): void {
    const panel = this.panels.get(id);
    if (!panel) return;
    panel.restX = geometry.restX;
    panel.restY = geometry.restY;
    panel.offX = geometry.offX;
    panel.offY = geometry.offY;
    this.scene.tweens.killTweensOf(panel.target);
    const atRest = this.state === 'in';
    panel.target.setPosition(atRest ? panel.restX : panel.offX, atRest ? panel.restY : panel.offY);
  }

  slideIn(onComplete?: () => void): void {
    this.slide('in', onComplete);
  }

  slideOut(onComplete?: () => void): void {
    // Treated as off immediately: a resize mid-exit should land on the
    // off-screen geometry rather than pop back to resting mid-flight.
    this.state = 'off';
    this.slide('out', onComplete);
  }

  private slide(direction: 'in' | 'out', onComplete?: () => void): void {
    const panels = [...this.panels.values()];
    let remaining = panels.length;
    if (remaining === 0) {
      if (direction === 'in') this.state = 'in';
      onComplete?.();
      return;
    }
    for (const panel of panels) {
      this.scene.tweens.add({
        targets: panel.target,
        x: direction === 'in' ? panel.restX : panel.offX,
        y: direction === 'in' ? panel.restY : panel.offY,
        duration: DIALOGUE_TIMING.slideMs,
        // Sharp arrival, sharp exit: no easing softness, matching the style.
        ease: direction === 'in' ? 'Quint.easeOut' : 'Quint.easeIn',
        onComplete: () => {
          remaining -= 1;
          if (remaining === 0) {
            if (direction === 'in') this.state = 'in';
            onComplete?.();
          }
        },
      });
    }
  }
}
