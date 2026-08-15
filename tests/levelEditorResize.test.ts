import { describe, expect, it } from 'vitest';
import {
  resizeBoundsFromPointer,
  resizeHandlePoints,
  type ResizeBounds,
} from '../src/game/systems/levelEditorResize';
import { validateBerlinEntities } from '../src/game/level/berlin/berlinLevelSchema';

const original: ResizeBounds = { left: 100, right: 300, top: 200, bottom: 300 };
const minimum = { width: 40, height: 20 };

describe('level editor resize geometry', () => {
  it('places four corner and four edge handles on the selected bounds', () => {
    expect(resizeHandlePoints(original)).toEqual({
      nw: { x: 100, y: 200 },
      n: { x: 200, y: 200 },
      ne: { x: 300, y: 200 },
      e: { x: 300, y: 250 },
      se: { x: 300, y: 300 },
      s: { x: 200, y: 300 },
      sw: { x: 100, y: 300 },
      w: { x: 100, y: 250 },
    });
  });

  it('resizes one edge while keeping the opposite edge fixed', () => {
    expect(resizeBoundsFromPointer(original, 'e', { x: 360, y: 250 }, minimum, false)).toEqual({
      left: 100,
      right: 360,
      top: 200,
      bottom: 300,
    });
  });

  it('changes both dimensions from a corner', () => {
    expect(resizeBoundsFromPointer(original, 'nw', { x: 60, y: 150 }, minimum, false)).toEqual({
      left: 60,
      right: 300,
      top: 150,
      bottom: 300,
    });
  });

  it('clamps dragged edges before width or height can become zero', () => {
    expect(resizeBoundsFromPointer(original, 'nw', { x: 500, y: 500 }, minimum, false)).toEqual({
      left: 260,
      right: 300,
      top: 280,
      bottom: 300,
    });
  });

  it('keeps the original aspect ratio for Shift-corner resizing', () => {
    const resized = resizeBoundsFromPointer(original, 'se', { x: 350, y: 310 }, minimum, true);
    expect(resized.left).toBe(100);
    expect(resized.top).toBe(200);
    expect(resized.right - resized.left).toBe(250);
    expect(resized.bottom - resized.top).toBe(125);
  });

  it('keeps the original aspect ratio for Shift-edge resizing around the other axis', () => {
    const resized = resizeBoundsFromPointer(original, 'e', { x: 400, y: 250 }, minimum, true);
    expect(resized.left).toBe(100);
    expect(resized.right).toBe(400);
    expect(resized.top).toBe(175);
    expect(resized.bottom).toBe(325);
  });
});

describe('level editor size persistence compatibility', () => {
  const platform = {
    id: 'test-platform',
    type: 'platform' as const,
    label: 'TEST PLATFORM',
    x: 200,
    y: 280,
    topY: 260,
    width: 300,
    height: 40,
    artSlot: 'platform.test',
  };

  it('accepts legacy layouts without editor resize metadata', () => {
    expect(validateBerlinEntities([platform])).toEqual([platform]);
  });

  it('round-trips explicit resized dimensions and metadata', () => {
    const resized = { ...platform, width: 360, height: 54, editorSized: true };
    const serialized = JSON.parse(JSON.stringify([resized])) as unknown;
    expect(validateBerlinEntities(serialized)).toEqual([resized]);
  });
});
