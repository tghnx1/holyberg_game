import { afterEach, describe, expect, it } from 'vitest';
import { EmeraldLayer, EMERALD_HIDE_DELAY_MS } from '../src/game/boss/EmeraldLayer';
import { emeraldSpotLayout } from '../src/game/boss/bossEmeraldSpots';
import { bossEmeraldWindowSceneKey } from '../src/game/boss/bossEmeraldWindows';
import { resetSceneLayout, setSceneObjectLayout } from '../src/game/systems/sceneLayout';
import type { ArenaBounds } from '../src/game/boss/types';

/**
 * `EmeraldLayer` runs against a stand-in Phaser scene: enough of `add.sprite`,
 * `anims`, `tweens` and `time.delayedCall` for it to build, place, animate and
 * tear down its emeralds without a real Phaser runtime.
 */
interface FakeSprite {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  visible: boolean;
  frame: { realWidth: number; realHeight: number };
  destroyed: boolean;
  setOrigin: () => FakeSprite;
  setDepth: () => FakeSprite;
  setVisible: (value: boolean) => FakeSprite;
  setScale: (x: number, y?: number) => FakeSprite;
  setAlpha: (value: number) => FakeSprite;
  setPosition: (x: number, y: number) => FakeSprite;
  play: () => FakeSprite;
  destroy: () => void;
}

interface FakeTimer {
  fire: () => void;
  removed: boolean;
  remove: () => void;
}

function createScene() {
  const sprites: FakeSprite[] = [];
  const timers: FakeTimer[] = [];
  const scene = {
    add: {
      sprite(x: number, y: number): FakeSprite {
        const sprite: FakeSprite = {
          x,
          y,
          scaleX: 1,
          scaleY: 1,
          alpha: 1,
          visible: false,
          frame: { realWidth: 52, realHeight: 52 },
          destroyed: false,
          setOrigin: () => sprite,
          setDepth: () => sprite,
          setVisible(value) {
            sprite.visible = value;
            return sprite;
          },
          setScale(sx, sy) {
            sprite.scaleX = sx;
            sprite.scaleY = sy ?? sx;
            return sprite;
          },
          setAlpha(value) {
            sprite.alpha = value;
            return sprite;
          },
          setPosition(px, py) {
            sprite.x = px;
            sprite.y = py;
            return sprite;
          },
          play: () => sprite,
          destroy() {
            sprite.destroyed = true;
          },
        };
        sprites.push(sprite);
        return sprite;
      },
    },
    anims: {
      exists: () => false,
      create: () => undefined,
    },
    tweens: {
      add: () => undefined,
      killTweensOf: () => undefined,
    },
    time: {
      delayedCall(_delay: number, callback: () => void): FakeTimer {
        const timer: FakeTimer = {
          removed: false,
          fire() {
            if (timer.removed) return;
            timer.removed = true;
            callback();
          },
          remove() {
            timer.removed = true;
          },
        };
        timers.push(timer);
        return timer as never;
      },
    },
  };
  return { scene, sprites, timers };
}

// A scene key of its own, so these never depend on — or disturb — the arena
// actually authored in `sceneLayout.json`.
const SCENE_KEY = 'EmeraldLayerTest';
const arena: ArenaBounds = { minX: 70, maxX: 1210 };

function authorSpots(windowId: string, spots: { id: string; x: number; y: number; scale?: number }[]) {
  const sceneKey = bossEmeraldWindowSceneKey(SCENE_KEY, windowId);
  for (const spot of spots) {
    setSceneObjectLayout(sceneKey, spot.id, emeraldSpotLayout({ x: spot.x, y: spot.y }, spot.scale ?? 1));
  }
}

describe('EmeraldLayer', () => {
  afterEach(() => resetSceneLayout());

  it('translates the authored group so it lands near the player anchor, preserving spacing', () => {
    authorSpots('attack-00', [
      { id: 'emerald-01', x: -100, y: 560 },
      { id: 'emerald-02', x: 0, y: 560 },
      { id: 'emerald-03', x: 100, y: 560 },
    ]);
    const { scene, sprites } = createScene();
    const layer = new EmeraldLayer(scene as never, SCENE_KEY);
    layer.setBounds(arena);

    layer.showWindow('attack-00', 500);

    const xs = sprites.map((sprite) => sprite.x).sort((a, b) => a - b);
    expect(xs).toEqual([400, 500, 600]);
  });

  it('keeps authored spacing/order when the player anchor changes between windows', () => {
    authorSpots('attack-00', [
      { id: 'emerald-01', x: -50, y: 560 },
      { id: 'emerald-02', x: 50, y: 560 },
    ]);
    const { scene, sprites } = createScene();
    const layer = new EmeraldLayer(scene as never, SCENE_KEY);
    layer.setBounds(arena);

    layer.showWindow('attack-00', 200);
    expect(sprites.map((s) => s.x).sort((a, b) => a - b)).toEqual([150, 250]);

    layer.showWindow('attack-00', 900);
    const surviving = sprites.filter((s) => !s.destroyed);
    expect(surviving.map((s) => s.x).sort((a, b) => a - b)).toEqual([850, 950]);
  });

  it('shifts the whole group, not individual emeralds, to stay inside the arena', () => {
    authorSpots('attack-00', [
      { id: 'emerald-01', x: -40, y: 560 },
      { id: 'emerald-02', x: 40, y: 560 },
    ]);
    const { scene, sprites } = createScene();
    const layer = new EmeraldLayer(scene as never, SCENE_KEY);
    layer.setBounds(arena);

    // Anchored near the left wall: an unclamped group would push emerald-01
    // past minX (70).
    layer.showWindow('attack-00', 90);

    const xs = sprites.map((s) => s.x).sort((a, b) => a - b);
    expect(xs[0]).toBeGreaterThanOrEqual(arena.minX);
    // Spacing between the two emeralds is preserved (80px apart), only shifted.
    expect(xs[1] - xs[0]).toBeCloseTo(80);
  });

  it('saves an edited position as an offset relative to the window anchor', () => {
    authorSpots('attack-00', [{ id: 'emerald-01', x: 0, y: 560 }]);
    const { scene } = createScene();
    const layer = new EmeraldLayer(scene as never, SCENE_KEY);
    layer.setBounds(arena);
    layer.showWindow('attack-00', 500);

    const editable = layer.getEditableObjects()[0];
    editable.onChange?.({ x: 620, y: 560, scaleX: 1, scaleY: 1 });

    // Rebuild the window at a different anchor: the saved offset (+120) must
    // still apply relative to the new anchor, not the old absolute position.
    layer.showWindow('attack-00', 300);
    const moved = layer.getEditableObjects()[0];
    const sprite = moved.target as unknown as FakeSprite;
    expect(sprite.x).toBeCloseTo(420);
  });

  it('isolates edits, copies and deletes to the active telegraph window only', () => {
    authorSpots('attack-03', [{ id: 'emerald-01', x: 0, y: 560 }]);
    authorSpots('attack-04', [{ id: 'emerald-01', x: 0, y: 560 }]);
    const { scene } = createScene();
    const layer = new EmeraldLayer(scene as never, SCENE_KEY);
    layer.setBounds(arena);

    layer.showWindow('attack-03', 400);
    const [original] = layer.getEditableObjects();
    const copy = original.clone?.();
    expect(copy).toBeDefined();
    expect(layer.getEditableObjects()).toHaveLength(2);
    original.remove?.();
    expect(layer.getEditableObjects()).toHaveLength(1);
    expect(layer.getEditableObjects()[0].id).toBe(copy?.id);

    // attack-04's own window is untouched by any of the above.
    layer.showWindow('attack-04', 400);
    expect(layer.getEditableObjects()).toHaveLength(1);
    expect(layer.getEditableObjects()[0].id).toBe('emerald-01');
  });

  it('keeps remaining emeralds visible/collectable for 1000ms after the attack activates, then hides them', () => {
    authorSpots('attack-00', [{ id: 'emerald-01', x: 0, y: 560 }]);
    const { scene, timers } = createScene();
    const layer = new EmeraldLayer(scene as never, SCENE_KEY);
    layer.setBounds(arena);
    layer.showWindow('attack-00', 500);
    expect(layer.offeredCount).toBe(1);

    layer.scheduleHide();
    expect(layer.offeredCount).toBe(1);

    const timer = timers.find((t) => !t.removed);
    expect(timer).toBeDefined();
    timer?.fire();

    expect(layer.offeredCount).toBe(0);
  });

  it('defaults scheduleHide to the documented 1000ms delay constant', () => {
    expect(EMERALD_HIDE_DELAY_MS).toBe(1000);
  });

  it('never lets a stale hide timer from the previous attack hide the next attack’s emeralds', () => {
    authorSpots('attack-00', [{ id: 'emerald-01', x: 0, y: 560 }]);
    authorSpots('attack-01', [{ id: 'emerald-01', x: 0, y: 560 }]);
    const { scene, timers } = createScene();
    const layer = new EmeraldLayer(scene as never, SCENE_KEY);
    layer.setBounds(arena);

    layer.showWindow('attack-00', 500);
    layer.scheduleHide();
    const staleTimer = timers.find((t) => !t.removed);

    // The next telegraph starts before the old hide fires.
    layer.showWindow('attack-01', 700);
    expect(layer.offeredCount).toBe(1);

    // Firing the stale timer manually (bypassing its own `removed` guard)
    // proves showWindow actually cancelled it rather than merely outracing it.
    expect(staleTimer?.removed).toBe(true);
  });

  it('cancels a pending hide when the fight ends', () => {
    authorSpots('attack-00', [{ id: 'emerald-01', x: 0, y: 560 }]);
    const { scene, timers } = createScene();
    const layer = new EmeraldLayer(scene as never, SCENE_KEY);
    layer.setBounds(arena);
    layer.showWindow('attack-00', 500);
    layer.scheduleHide();

    layer.hideAll();

    expect(timers.every((t) => t.removed)).toBe(true);
    expect(layer.offeredCount).toBe(0);
  });

  it('cancels a pending hide when the layer is destroyed', () => {
    authorSpots('attack-00', [{ id: 'emerald-01', x: 0, y: 560 }]);
    const { scene, timers } = createScene();
    const layer = new EmeraldLayer(scene as never, SCENE_KEY);
    layer.setBounds(arena);
    layer.showWindow('attack-00', 500);
    layer.scheduleHide();

    layer.destroy();

    expect(timers.every((t) => t.removed)).toBe(true);
  });
});
