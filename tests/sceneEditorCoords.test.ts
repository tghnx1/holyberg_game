import { describe, expect, it } from 'vitest';
import {
  worldPointToParentLocal,
  worldRectToParentLocal,
  type AncestorTransform,
} from '../src/game/systems/sceneEditorCoords';

describe('worldPointToParentLocal', () => {
  it('1. leaves world and local coordinates equivalent with no parent container', () => {
    const point = worldPointToParentLocal(120, 84, []);
    expect(point).toEqual({ x: 120, y: 84 });
  });

  it('2. undoes a translated container: local = world - offset', () => {
    const ancestors: AncestorTransform[] = [{ x: 200, y: 50, scaleX: 1, scaleY: 1 }];
    const point = worldPointToParentLocal(260, 90, ancestors);
    expect(point.x).toBeCloseTo(60);
    expect(point.y).toBeCloseTo(40);
  });

  it('3. undoes a scaled + translated container: local = (world - offset) / scale', () => {
    const ancestors: AncestorTransform[] = [{ x: 100, y: 40, scaleX: 0.5, scaleY: 0.25 }];
    const point = worldPointToParentLocal(150, 55, ancestors);
    // world = offset + local*scale  =>  local = (world - offset) / scale
    expect(point.x).toBeCloseTo((150 - 100) / 0.5);
    expect(point.y).toBeCloseTo((55 - 40) / 0.25);
  });

  it('handles a nested chain (matches DialogueScene: content inside root)', () => {
    // root: translated only (a panel slide position); content: scaled + translated (cover-fit).
    const root: AncestorTransform = { x: 300, y: 20, scaleX: 1, scaleY: 1 };
    const content: AncestorTransform = { x: -10, y: 5, scaleX: 2, scaleY: 2 };
    // Immediate parent (content) first, outermost (root) last.
    const ancestors = [content, root];

    // Round-trip: local -> world (by hand) -> back to local via the function under test.
    const localX = 40;
    const localY = 15;
    const contentSpaceX = content.x + localX * content.scaleX;
    const contentSpaceY = content.y + localY * content.scaleY;
    const worldX = root.x + contentSpaceX * root.scaleX;
    const worldY = root.y + contentSpaceY * root.scaleY;

    const recovered = worldPointToParentLocal(worldX, worldY, ancestors);
    expect(recovered.x).toBeCloseTo(localX);
    expect(recovered.y).toBeCloseTo(localY);
  });

  it('round-trips arbitrary chains for any depth', () => {
    const chain: AncestorTransform[] = [
      { x: 5, y: -12, scaleX: 1.5, scaleY: 0.8 },
      { x: -40, y: 100, scaleX: 0.3, scaleY: 0.3 },
      { x: 700, y: 10, scaleX: 1, scaleY: 1 },
    ];
    // Compute world by applying the chain innermost-first, outermost-last (matches Phaser's own composition order).
    let x = 33;
    let y = -7;
    for (const ancestor of chain) {
      x = ancestor.x + x * ancestor.scaleX;
      y = ancestor.y + y * ancestor.scaleY;
    }
    const recovered = worldPointToParentLocal(x, y, chain);
    expect(recovered.x).toBeCloseTo(33);
    expect(recovered.y).toBeCloseTo(-7);
  });
});

describe('worldRectToParentLocal', () => {
  it('1. leaves a world rect unchanged with no parent container', () => {
    const rect = worldRectToParentLocal({ left: 10, top: 20, right: 110, bottom: 220 }, []);
    expect(rect).toEqual({ left: 10, top: 20, right: 110, bottom: 220 });
  });

  it('2. re-expresses a world rect inside a translated container', () => {
    const ancestors: AncestorTransform[] = [{ x: 50, y: 25, scaleX: 1, scaleY: 1 }];
    const rect = worldRectToParentLocal({ left: 60, top: 35, right: 160, bottom: 235 }, ancestors);
    expect(rect).toEqual({ left: 10, top: 10, right: 110, bottom: 210 });
  });

  it('3. re-expresses a world rect inside a scaled + translated container, preserving relative size', () => {
    const ancestors: AncestorTransform[] = [{ x: 100, y: 100, scaleX: 2, scaleY: 2 }];
    const rect = worldRectToParentLocal({ left: 120, top: 140, right: 220, bottom: 240 }, ancestors);
    // local = (world - offset) / scale
    expect(rect.left).toBeCloseTo(10);
    expect(rect.top).toBeCloseTo(20);
    expect(rect.right).toBeCloseTo(60);
    expect(rect.bottom).toBeCloseTo(70);
    // The local box is half the world box's size, matching the 2x parent scale.
    expect(rect.right - rect.left).toBeCloseTo((220 - 120) / 2);
    expect(rect.bottom - rect.top).toBeCloseTo((240 - 140) / 2);
  });
});
