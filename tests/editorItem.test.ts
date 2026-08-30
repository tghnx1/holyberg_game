import { describe, expect, it, vi } from 'vitest';
import {
  boundsContain,
  DEFAULT_MINIMUM_SIZE,
  isCloneable,
  isRemovable,
  isResizable,
  minimumSizeOf,
  shouldPreserveAspect,
  type EditableItem,
} from '../src/game/systems/editor/editorItem';
import {
  toEditableItem,
  type EditableObject,
} from '../src/game/systems/editor/transformItem';

const baseItem = (over: Partial<EditableItem> = {}): EditableItem => ({
  id: 'thing',
  getBounds: () => ({ left: 0, top: 0, right: 10, bottom: 10 }),
  setBounds: () => {},
  ...over,
});

/**
 * The optional members of `EditableItem` are capabilities, not settings: the
 * core offers copy/paste and delete for exactly the items that declare them.
 * That is the whole mechanism keeping duplication away from things it makes
 * no sense for, with nothing in the core naming any of them.
 */
describe('capabilities are opt-in', () => {
  it('treats an item without clone as un-copyable', () => {
    expect(isCloneable(baseItem())).toBe(false);
    expect(isCloneable(baseItem({ clone: () => 'copy-1' }))).toBe(true);
  });

  it('treats an item without remove as un-deletable', () => {
    expect(isRemovable(baseItem())).toBe(false);
    expect(isRemovable(baseItem({ remove: () => {} }))).toBe(true);
  });

  it('is resizable unless it explicitly opts out', () => {
    expect(isResizable(baseItem())).toBe(true);
    expect(isResizable(baseItem({ resizable: false }))).toBe(false);
  });

  it('falls back to a shared minimum size', () => {
    expect(minimumSizeOf(baseItem())).toEqual(DEFAULT_MINIMUM_SIZE);
    expect(minimumSizeOf(baseItem({ getMinimumSize: () => ({ width: 48, height: 8 }) }))).toEqual({
      width: 48,
      height: 8,
    });
  });
});

describe('aspect ratio policy comes from the item, not the core', () => {
  it('defaults to Shift-locks, which is how Level 1 has always resized', () => {
    expect(shouldPreserveAspect(baseItem(), true)).toBe(true);
    expect(shouldPreserveAspect(baseItem(), false)).toBe(false);
  });

  it('lets a transform-backed object invert that, as those scenes expect', () => {
    const locked = baseItem({ preserveAspect: () => true });
    expect(shouldPreserveAspect(locked, false)).toBe(true);
    expect(shouldPreserveAspect(locked, true)).toBe(true);
  });
});

describe('bounds containment', () => {
  const bounds = { left: 0, top: 0, right: 10, bottom: 10 };
  it('includes the edges', () => {
    expect(boundsContain(bounds, { x: 0, y: 0 })).toBe(true);
    expect(boundsContain(bounds, { x: 10, y: 10 })).toBe(true);
  });
  it('excludes anything outside', () => {
    expect(boundsContain(bounds, { x: -0.5, y: 5 })).toBe(false);
    expect(boundsContain(bounds, { x: 5, y: 11 })).toBe(false);
  });
});

// ------------------------------------------------ transform-backed adapter

interface FakeTarget {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
  parentContainer?: FakeTarget;
  setPosition: (x: number, y: number) => void;
  setScale: (x: number, y: number) => void;
}

function fakeTarget(over: Partial<FakeTarget> = {}): FakeTarget {
  const target: FakeTarget = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    originX: 0,
    originY: 0,
    setPosition(x, y) {
      target.x = x;
      target.y = y;
    },
    setScale(x, y) {
      target.scaleX = x;
      target.scaleY = y;
    },
    ...over,
  };
  return target;
}

function fakeObject(over: Partial<EditableObject> = {}): EditableObject {
  return {
    id: 'portrait',
    target: fakeTarget() as unknown as EditableObject['target'],
    getNativeSize: () => ({ width: 100, height: 50 }),
    ...over,
  };
}

describe('transform-backed objects on the shared core', () => {
  it('reports world bounds built from its own transform and native size', () => {
    const object = fakeObject();
    const item = toEditableItem(object);
    expect(item.getBounds()).toEqual({ left: 0, top: 0, right: 100, bottom: 50 });
  });

  it('accounts for a moved and scaled parent container, both ways', () => {
    const parent = fakeTarget({ x: 200, y: 100, scaleX: 2, scaleY: 2 });
    const target = fakeTarget({ x: 10, y: 5, parentContainer: parent });
    const object = fakeObject({ target: target as unknown as EditableObject['target'] });
    const item = toEditableItem(object);

    // Local box (10,5)-(110,55) scaled 2x and offset by the parent.
    expect(item.getBounds()).toEqual({ left: 220, top: 110, right: 420, bottom: 210 });

    // Setting those exact world bounds back must be a no-op on the local
    // transform — this round trip is what stops an object inside a container
    // flying away the moment it is dragged.
    item.setBounds({ left: 220, top: 110, right: 420, bottom: 210 });
    expect(target.x).toBeCloseTo(10);
    expect(target.y).toBeCloseTo(5);
    expect(target.scaleX).toBeCloseTo(1);
    expect(target.scaleY).toBeCloseTo(1);
  });

  it('translates a drag into local space rather than world space', () => {
    const parent = fakeTarget({ x: 0, y: 0, scaleX: 2, scaleY: 2 });
    const target = fakeTarget({ parentContainer: parent });
    const object = fakeObject({ target: target as unknown as EditableObject['target'] });
    const item = toEditableItem(object);

    // Move 20 world px right: inside a 2x container that is 10 local px.
    item.setBounds({ left: 20, top: 0, right: 220, bottom: 100 });
    expect(target.x).toBeCloseTo(10);
  });

  it('restores the exact transform when an edit is cancelled', () => {
    const target = fakeTarget({ x: 7, y: 9, scaleX: 1.5, scaleY: 1.5 });
    const object = fakeObject({ target: target as unknown as EditableObject['target'] });
    const item = toEditableItem(object);

    const restore = item.beginEdit?.();
    item.setBounds({ left: 500, top: 500, right: 900, bottom: 700 });
    expect(target.x).not.toBeCloseTo(7);
    restore?.();
    expect(target.x).toBeCloseTo(7);
    expect(target.y).toBeCloseTo(9);
    expect(target.scaleX).toBeCloseTo(1.5);
  });

  it('notifies the owner after every change, so a scene can persist it', () => {
    const onChange = vi.fn();
    const item = toEditableItem(fakeObject({ onChange }));
    item.setBounds({ left: 0, top: 0, right: 200, bottom: 100 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ scaleX: 2, scaleY: 2 }),
    );
  });

  it('offers no clone for an object that did not declare one', () => {
    // Level 4's toilet backdrop and every scene's main player are exactly this.
    expect(toEditableItem(fakeObject()).clone).toBeUndefined();
  });

  it('registers a clone so the copy is immediately editable', () => {
    const copy = fakeObject({ id: 'npc:copy:1' });
    const registered: EditableObject[] = [];
    const item = toEditableItem(
      fakeObject({ id: 'npc', clone: () => copy }),
      (created) => {
        registered.push(created);
        return created.id;
      },
    );
    expect(item.clone?.()).toBe('npc:copy:1');
    expect(registered).toEqual([copy]);
  });

  it('reports a failed clone rather than inventing an id', () => {
    const item = toEditableItem(fakeObject({ clone: () => undefined }));
    expect(item.clone?.()).toBeUndefined();
  });

  it('exposes layer controls only when the object can supply a container', () => {
    expect(toEditableItem(fakeObject()).bringToFront).toBeUndefined();
    const withContainer = toEditableItem(
      fakeObject({ getParentContainer: () => undefined }),
    );
    expect(withContainer.bringToFront).toBeTypeOf('function');
  });
});
