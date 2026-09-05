import type Phaser from 'phaser';
import {
  localBoundsFromTransform,
  parentLocalRectToWorld,
  positionFromLocalBounds,
  worldRectToParentLocal,
  type AncestorTransform,
} from '../sceneEditorCoords';
import type { ResizeBounds } from '../levelEditorResize';
import type { EditableItem } from './editorItem';

/**
 * The adapter for scenes that edit a Phaser display object's own transform —
 * Club, Level 4 and Dialogue — expressed in the shared core's world-space
 * `EditableItem` terms.
 *
 * Everything nested-container-aware lives here rather than in the core: a
 * dialogue portrait sits several moved and scaled containers deep, so its
 * `x`/`y` are in its parent's local space while the core works in world
 * space. Bounds go out through `parentLocalRectToWorld` and come back in
 * through `worldRectToParentLocal`, and the local box itself is built from
 * the target's own position/scale/origin and native size rather than from
 * `getBounds()`, so none of that method's quirks around nested or masked
 * containers can leak into the resize maths.
 */

export type EditableTarget = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform & {
    getBounds: (output?: Phaser.Geom.Rectangle) => Phaser.Geom.Rectangle;
    /** Absent on plain Containers; treated as (0, 0) — top-left — when missing. */
    originX?: number;
    originY?: number;
  };

export interface EditableTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

export interface EditableSnapshot extends EditableTransform {
  id: string;
}

/**
 * A transform-backed editable object, as Club, Level 4 and Dialogue already
 * declare them. Unchanged from the original editor's contract apart from the
 * new optional `clone`, which is what makes copy/paste available for the
 * objects where duplicating is meaningful (a club NPC) and absent where it is
 * not (Level 4's single toilet backdrop, the main player).
 */
export interface EditableObject {
  id: string;
  /** The object the editor selects, drags, resizes and outlines. */
  target: EditableTarget;
  /** Unscaled size (i.e. size at scaleX=scaleY=1), used for the size readout and resize math. */
  getNativeSize: () => { width: number; height: number };
  /** Called after any move/resize/nudge so the owner can persist or react. */
  onChange?: (transform: EditableTransform) => void;
  /** false disables resize handles entirely (move + nudge only). Default true. */
  resizable?: boolean;
  /** true lets a corner/edge drag change width and height independently. Default false (locked aspect). */
  allowNonUniformScale?: boolean;
  /** Optional: lets `[`/`]` shift this object's render order within its parent container. */
  getParentContainer?: () => Phaser.GameObjects.Container | undefined;
  /** Shown in the HUD panel instead of the id. */
  label?: string;
  /**
   * Optional cloning capability. Present only on objects a scene is willing
   * to duplicate; the core offers copy/paste for exactly those, and leaves it
   * off everything else — Level 4's single toilet backdrop and every scene's
   * main player have no `clone`, so they simply cannot be copied.
   *
   * Returns the freshly built duplicate as another `EditableObject`; the
   * editor registers it, so the copy is immediately selectable, draggable and
   * included in the next save.
   */
  clone?: () => EditableObject | undefined;
  /** Optional deletion capability, paired with `clone` for scenes that support both. */
  remove?: () => void;
  /** Optional authored horizontal mirror for character-like sprites only. */
  flipHorizontal?: () => void;
}

function ancestorChain(target: EditableTarget): AncestorTransform[] {
  const chain: AncestorTransform[] = [];
  let container = target.parentContainer;
  while (container) {
    chain.push({
      x: container.x,
      y: container.y,
      scaleX: container.scaleX,
      scaleY: container.scaleY,
    });
    container = container.parentContainer;
  }
  return chain;
}

function localBoundsOf(object: EditableObject): ResizeBounds {
  const native = object.getNativeSize();
  const target = object.target;
  return localBoundsFromTransform(
    {
      x: target.x,
      y: target.y,
      scaleX: target.scaleX,
      scaleY: target.scaleY,
      originX: target.originX ?? 0,
      originY: target.originY ?? 0,
    },
    native.width,
    native.height,
  );
}

export function transformOf(object: EditableObject): EditableTransform {
  return {
    x: object.target.x,
    y: object.target.y,
    scaleX: object.target.scaleX,
    scaleY: object.target.scaleY,
  };
}

/**
 * Wraps a transform-backed object as an item the shared core can edit.
 *
 * `registerClone` is how a duplicate produced by `object.clone` gets into the
 * editor's registry, so the core can select and move it the moment it exists.
 */
export function toEditableItem(
  object: EditableObject,
  registerClone: (created: EditableObject) => string = (created) => created.id,
): EditableItem {
  const applyTransform = (transform: EditableTransform): void => {
    object.target.setPosition(transform.x, transform.y);
    object.target.setScale(transform.scaleX, transform.scaleY);
    object.onChange?.(transform);
  };

  return {
    id: object.id,
    label: object.label,
    resizable: object.resizable,
    // These scenes lock the aspect ratio by default and opt out per object,
    // which is the opposite of Berlin's free resize; both are expressed here
    // rather than assumed by the core.
    preserveAspect: () => !object.allowNonUniformScale,

    getBounds: () => parentLocalRectToWorld(localBoundsOf(object), ancestorChain(object.target)),

    setBounds: (worldBounds) => {
      const local = worldRectToParentLocal(worldBounds, ancestorChain(object.target));
      const native = object.getNativeSize();
      if (native.width <= 0 || native.height <= 0) return;
      const position = positionFromLocalBounds(
        local,
        object.target.originX ?? 0,
        object.target.originY ?? 0,
      );
      applyTransform({
        x: position.x,
        y: position.y,
        scaleX: (local.right - local.left) / native.width,
        scaleY: (local.bottom - local.top) / native.height,
      });
    },

    beginEdit: () => {
      const before = transformOf(object);
      return () => applyTransform(before);
    },

    clone: object.clone
      ? () => {
          const created = object.clone?.();
          return created ? registerClone(created) : undefined;
        }
      : undefined,
    remove: object.remove ? () => object.remove?.() : undefined,
    flipHorizontal: object.flipHorizontal ? () => object.flipHorizontal?.() : undefined,

    bringToFront: object.getParentContainer
      ? () => object.getParentContainer?.()?.bringToTop(object.target)
      : undefined,
    sendToBack: object.getParentContainer
      ? () => object.getParentContainer?.()?.sendToBack(object.target)
      : undefined,

    describe: () => [
      `scaleX ${object.target.scaleX.toFixed(3)}  scaleY ${object.target.scaleY.toFixed(3)}`,
    ],
  };
}
