import type {
  MinimumResizeSize,
  ResizeBounds,
} from '../levelEditorResize';

/**
 * The one thing the shared editor core edits.
 *
 * Deliberately free of Phaser and of every scene's domain types: the core
 * selects, drags, resizes, nudges, clones, deletes, outlines and reports an
 * `EditableItem` without knowing whether it is a Berlin obstacle backed by a
 * config + physics zone, a dialogue portrait nested three containers deep, or
 * a club NPC. Each scene supplies an adapter that expresses its own objects
 * in these terms and keeps its own domain rules to itself:
 *
 * ```text
 * Berlin adapter ─────┐
 * Club adapter ───────┤
 * Level4 adapter ─────┼─> shared SceneEditor core
 * Dialogue adapter ───┘
 * ```
 *
 * Everything geometric here is in **world space**, which is the space the
 * core draws its outlines and handles in and the space `pointer.worldX/Y`
 * already arrives in. An adapter whose object lives inside moved/scaled
 * parent containers converts on its own side, in `setBounds`.
 *
 * Optional members are genuine capabilities, not configuration: an item
 * without `clone` simply cannot be copied, and the core will not offer it.
 * That is how the single Level 4 toilet backdrop and the main player stay
 * un-clonable without anything naming them.
 */
export interface EditableItem {
  id: string;
  /** Shown in the HUD instead of the raw id. */
  label?: string;
  /** Short kind shown next to the label, e.g. Berlin's entity type. */
  kind?: string;

  /** Visual bounds: what gets outlined, hit-tested, and resized. World space. */
  getBounds: () => ResizeBounds;
  /**
   * Applies a new visual bounds box. The adapter decides what that means —
   * Berlin rewrites its config's x/y/width/height and re-syncs the artwork
   * and physics zone; a transform-backed object converts to parent-local and
   * sets x/y/scale.
   */
  setBounds: (bounds: ResizeBounds) => void;

  /** Smallest box this item may be resized to. Defaults to `DEFAULT_MINIMUM_SIZE`. */
  getMinimumSize?: () => MinimumResizeSize;
  /** false hides the resize handles entirely, leaving move + nudge. Default true. */
  resizable?: boolean;
  /**
   * Whether a pointer resize should lock the aspect ratio, given whether
   * Shift is held. The two existing editors disagree on the default — Berlin
   * resizes freely and Shift locks, the transform editor locks unless the
   * object opts out — so neither is baked into the core.
   */
  preserveAspect?: (shiftDown: boolean) => boolean;

  /**
   * Snapshots the item before an edit and returns the closure that restores
   * it, so Esc can cancel a drag or resize exactly, including any derived
   * domain state the bounds alone would not carry back (Berlin's obstacle
   * hitboxes, for one). Omit when a bounds round-trip is already lossless.
   */
  beginEdit?: () => () => void;
  /**
   * Called when a pointer drag or resize finishes, so an adapter that keeps a
   * per-session baseline (Berlin scales an obstacle's hitbox relative to the
   * config as it was when the resize *started*, not as it is mid-drag) can
   * drop it again. Keyboard nudges and `+`/`-` never open a session, so they
   * correctly compound from the current state instead.
   */
  endEdit?: () => void;

  /**
   * Present only on an item that can meaningfully be duplicated. Returns the
   * new item's id, or undefined if the clone could not be made. The core
   * offers copy/paste only for items that have this.
   */
  clone?: () => string | undefined;
  /** Present only on an item that can meaningfully be deleted. */
  remove?: () => void;

  /**
   * Extra draggable markers drawn alongside the item — Berlin's moving
   * platform travel ends are the current case.
   */
  getMarkers?: () => EditorMarker[];
  /** Handles a drag of one of `getMarkers`'s points. */
  dragMarker?: (markerId: string, point: EditorPoint) => void;

  /** Optional render-order control, bound to `[` and `]`. */
  bringToFront?: () => void;
  sendToBack?: () => void;

  /** Extra HUD lines, appended under the standard id/x/y/w/h block. */
  describe?: () => string[];
}

export interface EditorPoint {
  x: number;
  y: number;
}

export interface EditorMarker {
  id: string;
  point: EditorPoint;
  color: number;
}

/** Used for any item that does not narrow it further. */
export const DEFAULT_MINIMUM_SIZE: MinimumResizeSize = { width: 4, height: 4 };

export function minimumSizeOf(item: EditableItem): MinimumResizeSize {
  return item.getMinimumSize?.() ?? DEFAULT_MINIMUM_SIZE;
}

export function isResizable(item: EditableItem): boolean {
  return item.resizable !== false;
}

/** Capability check, so the core never offers copy on something un-clonable. */
export function isCloneable(item: EditableItem): boolean {
  return typeof item.clone === 'function';
}

export function isRemovable(item: EditableItem): boolean {
  return typeof item.remove === 'function';
}

export function shouldPreserveAspect(item: EditableItem, shiftDown: boolean): boolean {
  return item.preserveAspect?.(shiftDown) ?? shiftDown;
}

/** Bounds helper shared by hit-testing and the HUD readout. */
export function boundsContain(bounds: ResizeBounds, point: EditorPoint): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}
