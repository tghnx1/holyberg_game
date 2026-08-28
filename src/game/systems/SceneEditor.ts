import Phaser from 'phaser';
import {
  RESIZE_HANDLES,
  resizeBoundsFromPointer,
  resizeBoundsSize,
  resizeHandlePoints,
  type ResizeBounds,
  type ResizeHandle,
} from './levelEditorResize';
import {
  localBoundsFromTransform,
  positionFromLocalBounds,
  worldPointToParentLocal,
  type AncestorTransform,
} from './sceneEditorCoords';
import { setSceneEditorActive } from './sceneEditorState';

/**
 * Generic, reusable dev-only visual editor core.
 *
 * Deliberately knows nothing about Berlin entities, Arcade Physics, the
 * rhythm game, or any specific scene's domain types. A scene registers plain
 * `EditableObject` records — an id, a Phaser display object, its native
 * (unscaled) size, and a change callback — and the editor provides selection,
 * drag, arrow-key nudge, resize handles, keyboard scale, Shift-fast
 * modifiers, camera pan/zoom, a selection outline, an x/y/w/h/scale readout,
 * and a save trigger. Toggling it on/off (E) and binding that key is left to
 * the host scene, matching how BerlinScene already owns its own E/P keys.
 *
 * This is the shared core Berlin's existing LevelEditorSystem does not (yet)
 * run on — that file keeps its own bespoke implementation intact to avoid any
 * regression risk — but every *new* editable scene (DialogueScene now, Boss
 * and others later) should use this instead of writing another one.
 */

export interface EditableTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

export interface EditableSnapshot extends EditableTransform {
  id: string;
}

type EditableTarget = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform & {
    getBounds: (output?: Phaser.Geom.Rectangle) => Phaser.Geom.Rectangle;
    /** Absent on plain Containers; treated as (0, 0) — top-left — when missing. */
    originX?: number;
    originY?: number;
  };

export interface EditableObject {
  id: string;
  /** The object the editor selects, drags, resizes and outlines. */
  target: EditableTarget;
  /** Unscaled size (i.e. size at scaleX=scaleY=1), used for the size readout and resize math. */
  getNativeSize: () => { width: number; height: number };
  /** Called after any move/resize/nudge so the owner can persist or react (e.g. reposition a dependent element). */
  onChange?: (transform: EditableTransform) => void;
  /** false disables resize handles entirely (move + nudge only). Default true. */
  resizable?: boolean;
  /** true lets a corner/edge drag change width and height independently. Default false (locked aspect). */
  allowNonUniformScale?: boolean;
  /** Optional: lets `[`/`]` shift this object's render order within its parent container. */
  getParentContainer?: () => Phaser.GameObjects.Container | undefined;
  /** Shown in the HUD panel instead of the id. */
  label?: string;
}

export interface SceneEditorOptions {
  /** Called when the user presses P while the editor is active. */
  onSave?: (snapshot: EditableSnapshot[]) => void;
  /** Camera the editor pans/zooms; omit to disable that behaviour. Defaults to scene.cameras.main. */
  camera?: Phaser.Cameras.Scene2D.Camera | null;
  /**
   * Called right after E turns the editor on/off. Scenes with their own time-
   * based progression (tweens, delayed calls, a hand-rolled state machine
   * driven by `scene.time.now`) can use these to pause/resume that
   * progression while editing, so an object's own selection/drag/resize/
   * nudge/save inside SceneEditor is never affected by the host scene being
   * paused — those keep working purely off pointer/keyboard input, not the
   * scene clock. See DialogueScene for a worked example.
   */
  onEnable?: () => void;
  onDisable?: () => void;
}

const NUDGE_STEP = 1;
const NUDGE_STEP_FAST = 10;
const SCALE_STEP = 1.05;
const SCALE_STEP_FAST = 1.25;
const MIN_SCALE = 0.05;
const PAN_STEP = 60;
const PAN_STEP_FAST = 240;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.08;
const RESIZE_HANDLE_SCREEN = 9;
const MIN_SIZE = { width: 4, height: 4 };
const TOAST_MS = 1000;

const COLOR_IDLE = 0x53ffe0;
const COLOR_SELECTED = 0xffe36d;

interface DragState {
  object: EditableObject;
  offsetX: number;
  offsetY: number;
  before: EditableTransform;
}

interface ResizeState {
  object: EditableObject;
  handle: ResizeHandle;
  originalBounds: ResizeBounds;
  before: EditableTransform;
}

export class SceneEditor {
  private readonly objects = new Map<string, EditableObject>();
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly panel: Phaser.GameObjects.Text;
  private readonly toast: Phaser.GameObjects.Text;
  private readonly camera: Phaser.Cameras.Scene2D.Camera | null;
  private readonly shiftKey: Phaser.Input.Keyboard.Key;
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly growKeys: Phaser.Input.Keyboard.Key[];
  private readonly shrinkKeys: Phaser.Input.Keyboard.Key[];
  private readonly escapeKey: Phaser.Input.Keyboard.Key;
  private readonly saveKey: Phaser.Input.Keyboard.Key;
  private readonly raiseKey: Phaser.Input.Keyboard.Key;
  private readonly lowerKey: Phaser.Input.Keyboard.Key;

  private enabled = false;
  private selectedId?: string;
  private drag?: DragState;
  private resize?: ResizeState;
  private toastTimer?: Phaser.Time.TimerEvent;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: SceneEditorOptions = {},
  ) {
    this.camera = options.camera === undefined ? scene.cameras.main : options.camera;

    this.graphics = scene.add.graphics().setDepth(10_000).setScrollFactor(0).setVisible(false);
    this.panel = scene.add
      .text(18, 18, '', {
        fontFamily: 'Space Mono',
        fontSize: '13px',
        color: '#ffe36d',
        backgroundColor: '#120b1de6',
        padding: { x: 10, y: 8 },
        lineSpacing: 4,
      })
      .setScrollFactor(0)
      .setDepth(10_001)
      .setVisible(false);
    this.toast = scene.add
      .text(scene.scale.width / 2, 90, '', {
        fontFamily: 'Archivo Black',
        fontSize: '22px',
        color: '#120b1d',
        backgroundColor: '#ffe36d',
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10_002)
      .setVisible(false);

    const keyboard = scene.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.shiftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.growKeys = [
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS),
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ADD),
    ];
    this.shrinkKeys = [
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS),
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_SUBTRACT),
    ];
    this.escapeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.saveKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.raiseKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CLOSED_BRACKET);
    this.lowerKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.OPEN_BRACKET);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  get active(): boolean {
    return this.enabled;
  }

  register(object: EditableObject): void {
    this.objects.set(object.id, object);
  }

  unregister(id: string): void {
    if (this.selectedId === id) this.selectedId = undefined;
    this.objects.delete(id);
  }

  toggle(): void {
    this.enabled = !this.enabled;
    this.graphics.setVisible(this.enabled);
    this.panel.setVisible(this.enabled);
    if (!this.enabled) {
      this.selectedId = undefined;
      this.drag = undefined;
      this.resize = undefined;
    }
    setSceneEditorActive(this.scene, this.enabled);
    if (this.enabled) this.options.onEnable?.();
    else this.options.onDisable?.();
  }

  getSnapshot(): EditableSnapshot[] {
    return [...this.objects.values()].map((object) => ({
      id: object.id,
      ...this.transformOf(object),
    }));
  }

  private transformOf(object: EditableObject): EditableTransform {
    return { x: object.target.x, y: object.target.y, scaleX: object.target.scaleX, scaleY: object.target.scaleY };
  }

  /**
   * Walks `target`'s parentContainer chain (immediate parent first, root
   * last) into the plain translate/scale records `sceneEditorCoords`'s pure
   * math operates on. Every one of this editor's containers only translates
   * and scales — never rotates — so that's all this chain carries.
   */
  private getAncestorChain(target: EditableTarget): AncestorTransform[] {
    const chain: AncestorTransform[] = [];
    let container = target.parentContainer;
    while (container) {
      chain.push({ x: container.x, y: container.y, scaleX: container.scaleX, scaleY: container.scaleY });
      container = container.parentContainer;
    }
    return chain;
  }

  /**
   * Converts a world-space point into the coordinate space of `target`'s own
   * parent container — i.e. the same space `target.x`/`target.y` are already
   * expressed in. Every drag/resize computation must go through this before
   * touching a target's position, or mixing world bounds/pointer coordinates
   * with a target's local x/y makes the object jump or fly away the moment
   * its parent container is moved, scaled, or nested. With no parent
   * container the two spaces coincide.
   */
  private worldToParentLocal(target: EditableTarget, worldX: number, worldY: number): { x: number; y: number } {
    return worldPointToParentLocal(worldX, worldY, this.getAncestorChain(target));
  }

  /** Re-expresses a world-space AABB (from `target.getBounds()`) in `target`'s parent-local space. */
  /**
   * The only geometry resize starts from. Built directly from the target's
   * own local x/y/scale, native size and origin — never from `getBounds()` —
   * so it is already exactly in the target's parent-local space with no
   * conversion, and can't inherit any of getBounds()'s own quirks around
   * nested/masked containers.
   */
  private getLocalBounds(object: EditableObject): ResizeBounds {
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

  private applyTransform(object: EditableObject, transform: EditableTransform): void {
    object.target.setPosition(transform.x, transform.y);
    object.target.setScale(transform.scaleX, transform.scaleY);
    object.onChange?.(transform);
  }

  update(): void {
    if (!this.enabled) return;
    this.handleEscape();
    this.handleSave();
    this.handleLayerKeys();
    this.handleNudgeOrPan();
    this.handleScaleKeys();
    this.redraw();
  }

  private handleEscape(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.escapeKey)) return;
    if (this.resize) {
      this.applyTransform(this.resize.object, this.resize.before);
      this.resize = undefined;
      this.flash('RESIZE CANCELLED');
    } else if (this.drag) {
      this.applyTransform(this.drag.object, this.drag.before);
      this.drag = undefined;
      this.flash('MOVE CANCELLED');
    } else if (this.selectedId) {
      this.selectedId = undefined;
    }
  }

  private handleSave(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.saveKey)) return;
    this.options.onSave?.(this.getSnapshot());
    this.flash('LAYOUT SAVED');
  }

  private handleLayerKeys(): void {
    const object = this.selectedObject();
    if (!object?.getParentContainer) return;
    const container = object.getParentContainer();
    if (!container) return;
    if (Phaser.Input.Keyboard.JustDown(this.raiseKey)) container.bringToTop(object.target);
    if (Phaser.Input.Keyboard.JustDown(this.lowerKey)) container.sendToBack(object.target);
  }

  private handleNudgeOrPan(): void {
    const step = this.shiftKey.isDown ? NUDGE_STEP_FAST : NUDGE_STEP;
    const object = this.selectedObject();
    const dx = (this.cursors.right.isDown ? 1 : 0) - (this.cursors.left.isDown ? 1 : 0);
    const dy = (this.cursors.down.isDown ? 1 : 0) - (this.cursors.up.isDown ? 1 : 0);
    if (dx === 0 && dy === 0) return;
    if (object && !this.drag && !this.resize) {
      if (!Phaser.Input.Keyboard.JustDown(this.cursors.left) &&
        !Phaser.Input.Keyboard.JustDown(this.cursors.right) &&
        !Phaser.Input.Keyboard.JustDown(this.cursors.up) &&
        !Phaser.Input.Keyboard.JustDown(this.cursors.down)) return;
      const transform = { ...this.transformOf(object), x: object.target.x + dx * step, y: object.target.y + dy * step };
      this.applyTransform(object, transform);
      return;
    }
    if (!object && this.camera) {
      const panStep = this.shiftKey.isDown ? PAN_STEP_FAST : PAN_STEP;
      this.camera.scrollX += dx * panStep;
      this.camera.scrollY += dy * panStep;
    }
  }

  private handleScaleKeys(): void {
    const object = this.selectedObject();
    if (!object || object.resizable === false) return;
    const grow = this.growKeys.some((key) => Phaser.Input.Keyboard.JustDown(key));
    const shrink = this.shrinkKeys.some((key) => Phaser.Input.Keyboard.JustDown(key));
    if (!grow && !shrink) return;
    const step = this.shiftKey.isDown ? SCALE_STEP_FAST : SCALE_STEP;
    const factor = grow ? step : 1 / step;
    const transform = {
      ...this.transformOf(object),
      scaleX: Math.max(MIN_SCALE, object.target.scaleX * factor),
      scaleY: Math.max(MIN_SCALE, object.target.scaleY * factor),
    };
    this.applyTransform(object, transform);
  }

  private selectedObject(): EditableObject | undefined {
    return this.selectedId ? this.objects.get(this.selectedId) : undefined;
  }

  private onWheel(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || !this.camera) return;
    const step = this.shiftKey.isDown ? ZOOM_STEP * ZOOM_STEP : ZOOM_STEP;
    const factor = pointer.deltaY > 0 ? 1 / step : step;
    this.camera.zoom = Phaser.Math.Clamp(this.camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    const handleHit = this.hitTestHandle(pointer);
    if (handleHit) {
      const object = handleHit.object;
      this.resize = {
        object,
        handle: handleHit.handle,
        originalBounds: this.getLocalBounds(object),
        before: this.transformOf(object),
      };
      return;
    }

    const object = this.hitTestObject(pointer);
    if (!object) {
      this.selectedId = undefined;
      return;
    }
    this.selectedId = object.id;
    const local = this.worldToParentLocal(object.target, pointer.worldX, pointer.worldY);
    this.drag = {
      object,
      offsetX: local.x - object.target.x,
      offsetY: local.y - object.target.y,
      before: this.transformOf(object),
    };
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || !pointer.isDown) return;
    if (this.resize) {
      this.applyResize(this.resize, pointer);
      return;
    }
    if (this.drag) {
      const local = this.worldToParentLocal(this.drag.object.target, pointer.worldX, pointer.worldY);
      const transform = {
        ...this.transformOf(this.drag.object),
        x: local.x - this.drag.offsetX,
        y: local.y - this.drag.offsetY,
      };
      this.applyTransform(this.drag.object, transform);
    }
  }

  private onPointerUp(): void {
    this.drag = undefined;
    this.resize = undefined;
  }

  /**
   * Resize math runs entirely in `object.target`'s parent-local space, start
   * to finish: `originalBounds` (from `getLocalBounds`) and `object.target.x/y`
   * are already there, and the only thing that needs converting in is the
   * live pointer position. `resizeBoundsFromPointer` keeps the edge/corner
   * opposite the dragged handle anchored at its exact original coordinate;
   * `positionFromLocalBounds` then derives x/y from the resized box using
   * the object's own original origin, so growing or shrinking never moves
   * that anchored edge.
   */
  private applyResize(state: ResizeState, pointer: Phaser.Input.Pointer): void {
    const { object, handle, originalBounds } = state;
    const preserveAspect = !object.allowNonUniformScale;
    const local = this.worldToParentLocal(object.target, pointer.worldX, pointer.worldY);
    const newBounds = resizeBoundsFromPointer(originalBounds, handle, local, MIN_SIZE, preserveAspect);
    const newSize = resizeBoundsSize(newBounds);
    const native = object.getNativeSize();
    if (native.width <= 0 || native.height <= 0) return;

    const position = positionFromLocalBounds(newBounds, object.target.originX ?? 0, object.target.originY ?? 0);
    const transform: EditableTransform = {
      x: position.x,
      y: position.y,
      scaleX: newSize.width / native.width,
      scaleY: newSize.height / native.height,
    };
    this.applyTransform(object, transform);
  }

  private hitTestObject(pointer: Phaser.Input.Pointer): EditableObject | undefined {
    // Later-registered (typically higher-layered) objects are checked first.
    const objects = [...this.objects.values()].reverse();
    for (const object of objects) {
      const bounds = object.target.getBounds();
      if (Phaser.Geom.Rectangle.Contains(bounds, pointer.worldX, pointer.worldY)) return object;
    }
    return undefined;
  }

  private hitTestHandle(
    pointer: Phaser.Input.Pointer,
  ): { object: EditableObject; handle: ResizeHandle } | undefined {
    const object = this.selectedObject();
    if (!object || object.resizable === false) return undefined;
    const bounds = object.target.getBounds();
    const points = resizeHandlePoints({ left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom });
    const zoom = this.camera?.zoom ?? 1;
    const reach = RESIZE_HANDLE_SCREEN / zoom;
    for (const handle of RESIZE_HANDLES) {
      const point = points[handle];
      if (Math.abs(pointer.worldX - point.x) <= reach && Math.abs(pointer.worldY - point.y) <= reach) {
        return { object, handle };
      }
    }
    return undefined;
  }

  private redraw(): void {
    this.graphics.clear();
    for (const object of this.objects.values()) {
      const bounds = object.target.getBounds();
      const selected = object.id === this.selectedId;
      this.graphics.lineStyle(selected ? 2.5 : 1.5, selected ? COLOR_SELECTED : COLOR_IDLE, selected ? 1 : 0.65);
      this.graphics.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
      if (selected && object.resizable !== false) {
        const points = resizeHandlePoints({ left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom });
        this.graphics.fillStyle(COLOR_SELECTED, 1);
        for (const handle of RESIZE_HANDLES) {
          const point = points[handle];
          this.graphics.fillRect(point.x - 4, point.y - 4, 8, 8);
        }
      }
    }
    this.panel.setText(this.panelText());
  }

  private panelText(): string {
    const lines = ['SCENE EDITOR  —  E exit   P save   [ / ] layer   Esc cancel'];
    const object = this.selectedObject();
    if (object) {
      const native = object.getNativeSize();
      lines.push(
        `${object.label ?? object.id}`,
        `x ${object.target.x.toFixed(1)}  y ${object.target.y.toFixed(1)}`,
        `w ${(native.width * object.target.scaleX).toFixed(1)}  h ${(native.height * object.target.scaleY).toFixed(1)}`,
        `scaleX ${object.target.scaleX.toFixed(3)}  scaleY ${object.target.scaleY.toFixed(3)}`,
      );
    } else {
      lines.push('(nothing selected)');
    }
    return lines.join('\n');
  }

  private flash(message: string): void {
    this.toast.setText(message).setVisible(true);
    this.toastTimer?.remove();
    this.toastTimer = this.scene.time.delayedCall(TOAST_MS, () => this.toast.setVisible(false));
  }

  destroy(): void {
    setSceneEditorActive(this.scene, false);
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    this.graphics.destroy();
    this.panel.destroy();
    this.toast.destroy();
    this.toastTimer?.remove();
  }
}
