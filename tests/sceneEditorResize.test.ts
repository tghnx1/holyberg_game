import { describe, expect, it } from 'vitest';
import { resizeBoundsFromPointer, type ResizeHandle } from '../src/game/systems/levelEditorResize';
import {
  localBoundsFromTransform,
  positionFromLocalBounds,
  worldPointToParentLocal,
  type AncestorTransform,
  type LocalRect,
} from '../src/game/systems/sceneEditorCoords';

interface Origin {
  originX: number;
  originY: number;
}

const ORIGINS: Record<string, Origin> = {
  'top-left (0,0)': { originX: 0, originY: 0 },
  'bottom-center (0.5,1)': { originX: 0.5, originY: 1 },
  center: { originX: 0.5, originY: 0.5 },
};

const ANCESTOR_CASES: Record<string, AncestorTransform[]> = {
  'no parent container': [],
  'translated container': [{ x: 300, y: 80, scaleX: 1, scaleY: 1 }],
  'scaled container': [{ x: 0, y: 0, scaleX: 0.4, scaleY: 0.6 }],
  'translated + scaled nested containers (matches StationSceneView root/content)': [
    // Immediate parent (content) first, outermost (root) last.
    { x: -25, y: 12, scaleX: 1.6, scaleY: 1.6 },
    { x: 420, y: 30, scaleX: 1, scaleY: 1 },
  ],
};

/** The corner of `bounds` opposite the handle being dragged — the one a resize must never move. */
function anchoredCorner(bounds: LocalRect, handle: ResizeHandle): { x: number; y: number } {
  const x = handle.includes('w') ? bounds.right : handle.includes('e') ? bounds.left : (bounds.left + bounds.right) / 2;
  const y = handle.includes('n') ? bounds.bottom : handle.includes('s') ? bounds.top : (bounds.top + bounds.bottom) / 2;
  return { x, y };
}

/** World point that maps to `localX, localY` under `ancestors`, so the pipeline can be driven from world coordinates like the real pointer is. */
function localToWorld(localX: number, localY: number, ancestors: readonly AncestorTransform[]): { x: number; y: number } {
  let x = localX;
  let y = localY;
  for (const ancestor of ancestors) {
    x = ancestor.x + x * ancestor.scaleX;
    y = ancestor.y + y * ancestor.scaleY;
  }
  return { x, y };
}

describe('SceneEditor resize keeps the opposite anchor fixed', () => {
  const native = { width: 100, height: 60 };
  const handles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  for (const [originName, origin] of Object.entries(ORIGINS)) {
    for (const [ancestorName, ancestors] of Object.entries(ANCESTOR_CASES)) {
      for (const handle of handles) {
        it(`${originName} / ${ancestorName} / handle ${handle}`, () => {
          const transform = { x: 120, y: 90, scaleX: 1.2, scaleY: 0.9, ...origin };
          const originalBounds = localBoundsFromTransform(transform, native.width, native.height);
          const before = anchoredCorner(originalBounds, handle);

          // Drag the handle outward by a healthy, asymmetric amount in local space.
          const draggedLocal = { x: originalBounds.right + 37, y: originalBounds.bottom + 21 };
          const worldPointer = localToWorld(draggedLocal.x, draggedLocal.y, ancestors);

          // The full pipeline SceneEditor itself runs: world pointer -> parent-local -> resize -> position.
          const localPointer = worldPointToParentLocal(worldPointer.x, worldPointer.y, ancestors);
          const newBounds = resizeBoundsFromPointer(
            originalBounds,
            handle,
            localPointer,
            { width: 1, height: 1 },
            false,
          );
          const position = positionFromLocalBounds(newBounds, origin.originX, origin.originY);
          const newTransform = {
            x: position.x,
            y: position.y,
            scaleX: (newBounds.right - newBounds.left) / native.width,
            scaleY: (newBounds.bottom - newBounds.top) / native.height,
            ...origin,
          };

          // Reconstructing bounds from the transform SceneEditor would actually apply
          // must reproduce newBounds exactly, and its anchored corner must be untouched.
          const reconstructed = localBoundsFromTransform(newTransform, native.width, native.height);
          expect(reconstructed.left).toBeCloseTo(newBounds.left, 6);
          expect(reconstructed.top).toBeCloseTo(newBounds.top, 6);
          expect(reconstructed.right).toBeCloseTo(newBounds.right, 6);
          expect(reconstructed.bottom).toBeCloseTo(newBounds.bottom, 6);

          const after = anchoredCorner(reconstructed, handle);
          expect(after.x).toBeCloseTo(before.x, 6);
          expect(after.y).toBeCloseTo(before.y, 6);
        });
      }
    }
  }

  it('growing never moves the anchored edge even for a large scaled+translated ancestor chain', () => {
    const ancestors: AncestorTransform[] = [
      { x: -100, y: 40, scaleX: 3, scaleY: 3 },
      { x: 900, y: -50, scaleX: 0.25, scaleY: 0.25 },
    ];
    const transform = { x: 10, y: 10, scaleX: 1, scaleY: 1, originX: 0, originY: 0 };
    const originalBounds = localBoundsFromTransform(transform, native.width, native.height);
    const before = anchoredCorner(originalBounds, 'se');

    const worldPointer = localToWorld(originalBounds.right + 500, originalBounds.bottom + 300, ancestors);
    const localPointer = worldPointToParentLocal(worldPointer.x, worldPointer.y, ancestors);
    const newBounds = resizeBoundsFromPointer(originalBounds, 'se', localPointer, { width: 1, height: 1 }, false);
    const position = positionFromLocalBounds(newBounds, 0, 0);
    const reconstructed = localBoundsFromTransform(
      { x: position.x, y: position.y, scaleX: (newBounds.right - newBounds.left) / native.width, scaleY: (newBounds.bottom - newBounds.top) / native.height, originX: 0, originY: 0 },
      native.width,
      native.height,
    );

    expect(newBounds.right - newBounds.left).toBeGreaterThan(originalBounds.right - originalBounds.left);
    const after = anchoredCorner(reconstructed, 'se');
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});
