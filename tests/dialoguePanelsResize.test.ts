import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

import { DialoguePanels, type DialoguePanelId, type PanelGeometry } from '../src/game/dialogue/DialoguePanels';

interface StubTarget {
  x: number;
  y: number;
  setPosition: (x: number, y: number) => StubTarget;
}

interface StubTween {
  target: unknown;
  stopped: boolean;
  killed: boolean;
  stop: () => void;
  complete: () => void;
}

/**
 * Minimal stand-in for Phaser's tween manager: tweens never advance on their
 * own, so a test decides exactly when (or whether) each one finishes.
 *
 * `stop()` and `killTweensOf()` both end a tween *without* running its
 * onComplete, matching Phaser — that is precisely the behaviour the old
 * implementation relied on and lost the slide callback to.
 */
function createScene() {
  const tweens: StubTween[] = [];
  const scene = {
    tweens: {
      add(config: { targets: unknown; onComplete?: () => void }) {
        const tween: StubTween = {
          target: config.targets,
          stopped: false,
          killed: false,
          stop() {
            tween.stopped = true;
          },
          complete() {
            if (tween.killed) return;
            config.onComplete?.();
          },
        };
        tweens.push(tween);
        return tween;
      },
      killTweensOf(target: unknown) {
        for (const tween of tweens) {
          if (tween.target === target) tween.killed = true;
        }
      },
    },
  };
  return { scene, tweens };
}

function createTarget(): StubTarget {
  const target = { x: 0, y: 0 } as StubTarget;
  target.setPosition = (x: number, y: number) => {
    target.x = x;
    target.y = y;
    return target;
  };
  return target;
}

const PANEL_IDS: DialoguePanelId[] = ['topBar', 'bottomBar', 'scene', 'portrait', 'divider'];

/** Geometry generator, so each "viewport" produces distinguishable numbers. */
const geometryFor = (viewport: number, index: number): PanelGeometry => ({
  restX: viewport * 1000 + index * 10 + 1,
  restY: viewport * 1000 + index * 10 + 2,
  offX: -(viewport * 1000 + index * 10 + 3),
  offY: -(viewport * 1000 + index * 10 + 4),
});

describe('DialoguePanels resize safety', () => {
  let scene: ReturnType<typeof createScene>['scene'];
  let tweens: StubTween[];
  let panels: DialoguePanels;
  let targets: StubTarget[];
  let onComplete: ReturnType<typeof vi.fn>;

  /** Mimics DialogueScene.applyResponsiveLayout: every panel, in order. */
  const resizeTo = (viewport: number): void => {
    PANEL_IDS.forEach((id, index) => panels.updateGeometry(id, geometryFor(viewport, index)));
  };

  const expectAtRest = (viewport: number): void => {
    targets.forEach((target, index) => {
      const geometry = geometryFor(viewport, index);
      expect([target.x, target.y]).toEqual([geometry.restX, geometry.restY]);
    });
  };

  const expectOffScreen = (viewport: number): void => {
    targets.forEach((target, index) => {
      const geometry = geometryFor(viewport, index);
      expect([target.x, target.y]).toEqual([geometry.offX, geometry.offY]);
    });
  };

  beforeEach(() => {
    ({ scene, tweens } = createScene());
    panels = new DialoguePanels(scene as never);
    targets = [];
    onComplete = vi.fn();
    PANEL_IDS.forEach((id, index) => {
      const target = createTarget();
      targets.push(target);
      panels.add(id, target as never, geometryFor(0, index));
    });
  });

  it('starts off-screen and only reports "in" once the slide completes', () => {
    expect(panels.state).toBe('off');
    panels.slideIn(onComplete);
    expect(panels.state).toBe('slidingIn');
    expect(onComplete).not.toHaveBeenCalled();

    for (const tween of tweens) tween.complete();
    expect(panels.state).toBe('in');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expectAtRest(0);
  });

  it('still delivers the slide-in callback when a resize lands mid-slide', () => {
    panels.slideIn(onComplete);
    resizeTo(1);

    // The regression: panels snapped off-screen, the callback was killed with
    // the tweens, and the dialogue never reached playArrival/startLine.
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(panels.state).toBe('in');
    expectAtRest(1);
  });

  it('delivers it exactly once across repeated rotations during slide-in', () => {
    panels.slideIn(onComplete);
    for (const viewport of [1, 2, 3, 4]) resizeTo(viewport);
    // Any tween the scene manages to fire afterwards must not re-enter it.
    for (const tween of tweens) tween.complete();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(panels.state).toBe('in');
    expectAtRest(4);
  });

  it('stops the in-flight tweens rather than leaving them running', () => {
    panels.slideIn(onComplete);
    resizeTo(1);
    expect(tweens.every((tween) => tween.stopped)).toBe(true);
  });

  it('keeps settled panels on the new rest geometry when rotating mid-dialogue', () => {
    panels.slideIn(onComplete);
    for (const tween of tweens) tween.complete();
    onComplete.mockClear();

    for (const viewport of [1, 2, 3]) resizeTo(viewport);
    expect(panels.state).toBe('in');
    expectAtRest(3);
    // A resize outside a transition must not invent a completion.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('still delivers the slide-out callback when a resize lands mid-exit', () => {
    panels.slideIn();
    for (const tween of tweens) tween.complete();

    panels.slideOut(onComplete);
    expect(panels.state).toBe('slidingOut');
    resizeTo(1);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(panels.state).toBe('off');
    expectOffScreen(1);
  });

  it('delivers the slide-out callback exactly once across repeated rotations', () => {
    panels.slideIn();
    for (const tween of tweens) tween.complete();
    tweens.length = 0;

    panels.slideOut(onComplete);
    for (const viewport of [1, 2, 3]) resizeTo(viewport);
    for (const tween of tweens) tween.complete();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(panels.state).toBe('off');
    expectOffScreen(3);
  });

  it('rotating while off-screen keeps panels on the new off geometry', () => {
    resizeTo(1);
    expect(panels.state).toBe('off');
    expectOffScreen(1);
  });

  it('hands over a superseded transition before starting the next one', () => {
    const first = vi.fn();
    panels.slideIn(first);
    panels.slideOut(onComplete);

    expect(first).toHaveBeenCalledTimes(1);
    expect(panels.state).toBe('slidingOut');
    expect(onComplete).not.toHaveBeenCalled();
  });
});
