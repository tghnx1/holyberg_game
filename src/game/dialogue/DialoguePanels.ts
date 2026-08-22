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
 * `off`/`in` are the two resting states; the `sliding*` ones mean a
 * transition is in flight and its completion callback is still owed.
 */
export type DialoguePanelPhase = 'off' | 'slidingIn' | 'in' | 'slidingOut';

interface PanelTransition {
  direction: 'in' | 'out';
  onComplete?: () => void;
  tweens: Phaser.Tweens.Tween[];
  /** Latches on completion so the callback can only ever run once. */
  settled: boolean;
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
  private phase: DialoguePanelPhase = 'off';
  /** The slide currently in flight, if any; it still owes its callback. */
  private transition?: PanelTransition;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Exposed for tests and callers that need to know where the composition is. */
  get state(): DialoguePanelPhase {
    return this.phase;
  }

  add(
    id: DialoguePanelId,
    target: Phaser.GameObjects.Container | Phaser.GameObjects.Graphics,
    geometry: PanelGeometry,
  ): void {
    const panel: SlidingPanel = { target, ...geometry };
    this.panels.set(id, panel);
    this.snap(panel);
  }

  /**
   * Updates a panel's rest/off geometry after a viewport change and puts it
   * where the composition currently belongs.
   *
   * If a slide is in flight, the resize settles it first: the tweens are
   * stopped, every panel lands on the destination it was heading for, and the
   * completion callback runs — exactly once. Previously this killed each
   * panel's tween while the state still read `off`, so panels snapped
   * off-screen and the shared completion counter never reached zero; the
   * dialogue then never got its `playArrival`/`startLine` call and sat there
   * permanently blank. A rotation is already a disruptive event, so finishing
   * the 420ms slide early is a much better outcome than losing it.
   */
  updateGeometry(id: DialoguePanelId, geometry: PanelGeometry): void {
    const panel = this.panels.get(id);
    if (!panel) return;
    panel.restX = geometry.restX;
    panel.restY = geometry.restY;
    panel.offX = geometry.offX;
    panel.offY = geometry.offY;
    // Settling repositions every panel from its own (possibly still stale)
    // geometry; the remaining updateGeometry calls of this resize pass then
    // correct each of those in turn, all within the same frame.
    if (this.transition) {
      this.settle();
      return;
    }
    this.snap(panel);
  }

  slideIn(onComplete?: () => void): void {
    this.slide('in', onComplete);
  }

  slideOut(onComplete?: () => void): void {
    this.slide('out', onComplete);
  }

  /**
   * Stops any slide in flight, lands the panels on its destination and fires
   * its completion callback. Safe to call at any time, including when nothing
   * is running.
   */
  settle(): void {
    const transition = this.transition;
    if (!transition || transition.settled) return;
    // stop() does not fire the tween's own onComplete, and `settled` guards
    // the callback regardless of whether a given Phaser version does.
    for (const tween of transition.tweens) tween.stop();
    this.finish(transition);
  }

  private slide(direction: 'in' | 'out', onComplete?: () => void): void {
    // A new slide supersedes whatever was running; that one still gets its
    // callback rather than being dropped silently.
    this.settle();
    this.phase = direction === 'in' ? 'slidingIn' : 'slidingOut';

    const panels = [...this.panels.values()];
    const transition: PanelTransition = { direction, onComplete, tweens: [], settled: false };
    this.transition = transition;
    if (panels.length === 0) {
      this.finish(transition);
      return;
    }

    let remaining = panels.length;
    for (const panel of panels) {
      transition.tweens.push(
        this.scene.tweens.add({
          targets: panel.target,
          x: direction === 'in' ? panel.restX : panel.offX,
          y: direction === 'in' ? panel.restY : panel.offY,
          duration: DIALOGUE_TIMING.slideMs,
          // Sharp arrival, sharp exit: no easing softness, matching the style.
          ease: direction === 'in' ? 'Quint.easeOut' : 'Quint.easeIn',
          onComplete: () => {
            remaining -= 1;
            if (remaining === 0) this.finish(transition);
          },
        }),
      );
    }
  }

  /** Lands the composition and hands over the callback, at most once. */
  private finish(transition: PanelTransition): void {
    if (transition.settled) return;
    transition.settled = true;
    if (this.transition === transition) this.transition = undefined;
    this.phase = transition.direction === 'in' ? 'in' : 'off';
    // Guarantees the exact resting geometry even when a tween was cut short.
    for (const panel of this.panels.values()) this.snap(panel);
    transition.onComplete?.();
  }

  /** Places a panel at whichever of its two positions the current phase means. */
  private snap(panel: SlidingPanel): void {
    const atRest = this.phase === 'in' || this.phase === 'slidingIn';
    panel.target.setPosition(atRest ? panel.restX : panel.offX, atRest ? panel.restY : panel.offY);
  }
}
