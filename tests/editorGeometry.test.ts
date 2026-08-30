import { describe, expect, it } from 'vitest';
import {
  boundsSize,
  expandFromVisual,
  handleAt,
  markerAt,
  MARKER_RADIUS,
  MIN_PICK_SCREEN,
  narrowToVisual,
  pickBounds,
  RESIZE_HANDLE_SCREEN,
  scaleBoundsAboutCentre,
  screenToWorldLength,
  translateBounds,
} from '../src/game/systems/editor/editorGeometry';
import type { ResizeBounds } from '../src/game/systems/levelEditorResize';

const box = (left: number, top: number, right: number, bottom: number): ResizeBounds => ({
  left,
  top,
  right,
  bottom,
});

describe('screen-constant sizing', () => {
  it('expands a screen length into world units as the view zooms out', () => {
    expect(screenToWorldLength(9, 1)).toBe(9);
    expect(screenToWorldLength(9, 0.5)).toBe(18);
    expect(screenToWorldLength(9, 3)).toBe(3);
  });

  it('degrades safely on a nonsense zoom rather than dividing by zero', () => {
    expect(screenToWorldLength(9, 0)).toBe(9);
    expect(screenToWorldLength(9, Number.NaN)).toBe(9);
  });
});

describe('pick bounds', () => {
  it('leaves a comfortably large box alone', () => {
    const bounds = box(0, 0, 200, 100);
    expect(pickBounds(bounds, 1)).toEqual(bounds);
  });

  it('floors a tiny box to a minimum on-screen size, about its own centre', () => {
    const bounds = box(100, 100, 104, 104);
    const picked = pickBounds(bounds, 1);
    const size = boundsSize(picked);
    expect(size.width).toBeCloseTo(MIN_PICK_SCREEN);
    expect(size.height).toBeCloseTo(MIN_PICK_SCREEN);
    // Centre is preserved: a padded PNG's visible content is not necessarily
    // centred on the entity's authored position, so it must grow symmetrically.
    expect((picked.left + picked.right) / 2).toBeCloseTo(102);
    expect((picked.top + picked.bottom) / 2).toBeCloseTo(102);
  });

  it('grows further as the view zooms out, so nothing becomes unpickable', () => {
    const bounds = box(0, 0, 10, 10);
    const near = boundsSize(pickBounds(bounds, 1));
    const far = boundsSize(pickBounds(bounds, 0.25));
    expect(far.width).toBeGreaterThan(near.width);
    expect(far.width).toBeCloseTo(MIN_PICK_SCREEN / 0.25);
  });
});

describe('visible-artwork fractions', () => {
  // Luk's measured union bounds: the art occupies the middle of a padded canvas.
  const luk = { xRatio: 0.0481, yRatio: 0.11, widthRatio: 0.9171, heightRatio: 0.8112 };

  it('narrows a full display box down to the drawn artwork', () => {
    const full = box(0, 0, 100, 100);
    const visual = narrowToVisual(full, luk);
    expect(visual.left).toBeCloseTo(4.81);
    expect(visual.top).toBeCloseTo(11);
    expect(boundsSize(visual).width).toBeCloseTo(91.71);
    expect(boundsSize(visual).height).toBeCloseTo(81.12);
  });

  it('round-trips back to the full box, so a handle drag resizes the whole artwork', () => {
    const full = box(30, 40, 130, 190);
    const roundTripped = expandFromVisual(narrowToVisual(full, luk), luk);
    expect(roundTripped.left).toBeCloseTo(full.left);
    expect(roundTripped.right).toBeCloseTo(full.right);
    expect(roundTripped.top).toBeCloseTo(full.top);
    expect(roundTripped.bottom).toBeCloseTo(full.bottom);
  });

  it('is the identity for artwork that fills its own box', () => {
    const full = box(0, 0, 50, 60);
    expect(narrowToVisual(full, undefined)).toEqual(full);
    expect(expandFromVisual(full, undefined)).toEqual(full);
  });

  it('refuses to divide by a degenerate fraction', () => {
    const visual = box(0, 0, 50, 60);
    const degenerate = { xRatio: 0, yRatio: 0, widthRatio: 0, heightRatio: 0 };
    expect(expandFromVisual(visual, degenerate)).toEqual(visual);
  });
});

describe('handle hit testing', () => {
  const bounds = box(100, 100, 200, 200);

  it('finds each corner and edge handle at its own point', () => {
    expect(handleAt(bounds, { x: 100, y: 100 }, 1)).toBe('nw');
    expect(handleAt(bounds, { x: 200, y: 200 }, 1)).toBe('se');
    expect(handleAt(bounds, { x: 150, y: 100 }, 1)).toBe('n');
    expect(handleAt(bounds, { x: 200, y: 150 }, 1)).toBe('e');
  });

  it('misses when the pointer is nowhere near a handle', () => {
    expect(handleAt(bounds, { x: 150, y: 150 }, 1)).toBeUndefined();
  });

  it('keeps the same grab tolerance on screen as the view zooms out', () => {
    const justOutsideAtFullZoom = { x: 100 + RESIZE_HANDLE_SCREEN + 6, y: 100 };
    expect(handleAt(bounds, justOutsideAtFullZoom, 1)).toBeUndefined();
    // Zoomed out, the same world offset is a smaller screen offset, so it is
    // now within reach.
    expect(handleAt(bounds, justOutsideAtFullZoom, 0.25)).toBe('nw');
  });
});

describe('marker hit testing', () => {
  const markers = [
    { id: 'start', point: { x: 0, y: 0 }, color: 0 },
    { id: 'end', point: { x: 300, y: 0 }, color: 1 },
  ];

  it('picks the marker under the pointer', () => {
    expect(markerAt(markers, { x: 2, y: 2 }, 1)?.id).toBe('start');
    expect(markerAt(markers, { x: 298, y: 0 }, 1)?.id).toBe('end');
  });

  it('misses between the two', () => {
    expect(markerAt(markers, { x: 150, y: 0 }, 1)).toBeUndefined();
  });

  it('widens its reach in world units as the view zooms out', () => {
    const justOutside = { x: MARKER_RADIUS + 6, y: 0 };
    expect(markerAt(markers, justOutside, 1)).toBeUndefined();
    expect(markerAt(markers, justOutside, 0.25)?.id).toBe('start');
  });
});

describe('bounds transforms', () => {
  it('translates without resizing', () => {
    const moved = translateBounds(box(0, 0, 10, 20), 5, -3);
    expect(moved).toEqual(box(5, -3, 15, 17));
    expect(boundsSize(moved)).toEqual({ width: 10, height: 20 });
  });

  it('scales about the centre, which is what +/- do', () => {
    const grown = scaleBoundsAboutCentre(box(0, 0, 100, 100), 2);
    expect(grown).toEqual(box(-50, -50, 150, 150));
    // Centre is unmoved.
    expect((grown.left + grown.right) / 2).toBe(50);
    expect((grown.top + grown.bottom) / 2).toBe(50);
  });

  it('shrinks symmetrically too', () => {
    const shrunk = scaleBoundsAboutCentre(box(0, 0, 100, 100), 0.5);
    expect(boundsSize(shrunk)).toEqual({ width: 50, height: 50 });
    expect((shrunk.left + shrunk.right) / 2).toBe(50);
  });
});

/**
 * The Level 4 bug this layer exists to prevent: the overlay was drawn into a
 * scrollFactor-0 graphics while the boxes it drew were world-space, so every
 * outline sat a full `scrollX` away from its object as soon as the camera
 * followed the player. Nothing in this module may consult camera scroll —
 * only zoom, and only to hold a screen-constant size.
 */
describe('camera independence', () => {
  it('takes no scroll input at all: geometry is world space end to end', () => {
    const bounds = box(1000, 200, 1100, 300);
    // Whatever the camera is doing, the same world box yields the same
    // outline, handles and hit results — the overlay rides in world space
    // with the objects instead of being offset against them.
    expect(pickBounds(bounds, 1)).toEqual(bounds);
    expect(handleAt(bounds, { x: 1000, y: 200 }, 1)).toBe('nw');
    expect(handleAt(bounds, { x: 1100, y: 300 }, 1)).toBe('se');
  });
});
