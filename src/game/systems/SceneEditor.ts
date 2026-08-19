import Phaser from 'phaser';
import {
  RESIZE_HANDLES,
  resizeBoundsFromPointer,
  resizeBoundsSize,
  resizeHandlePoints,
  type ResizeBounds,
  type ResizeHandle,
} from './levelEditorResize';

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
      const bounds = object.target.getBounds();
      this.resize = {
        object,
        handle: handleHit.handle,
        originalBounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
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
    this.drag = {
      object,
      offsetX: pointer.worldX - object.target.x,
      offsetY: pointer.worldY - object.target.y,
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
      const transform = {
        ...this.transformOf(this.drag.object),
        x: pointer.worldX - this.drag.offsetX,
        y: pointer.worldY - this.drag.offsetY,
      };
      this.applyTransform(this.drag.object, transform);
    }
  }

  private onPointerUp(): void {
    this.drag = undefined;
    this.resize = undefined;
  }

  private applyResize(state: ResizeState, pointer: Phaser.Input.Pointer): void {
    const { object, handle, originalBounds } = state;
    const preserveAspect = !object.allowNonUniformScale;
    const newBounds = resizeBoundsFromPointer(
      originalBounds,
      handle,
      { x: pointer.worldX, y: pointer.worldY },
      MIN_SIZE,
      preserveAspect,
    );
    const originalSize = resizeBoundsSize(originalBounds);
    const newSize = resizeBoundsSize(newBounds);
    const native = object.getNativeSize();
    if (originalSize.width <= 0 || originalSize.height <= 0 || native.width <= 0 || native.height <= 0) return;

    // Preserve whatever anchor (origin) the target already renders from,
    // without needing to know what it is: express it as a fraction of the
    // pre-resize bounds and reapply that same fraction to the new bounds.
    const anchorFractionX = (object.target.x - originalBounds.left) / originalSize.width;
    const anchorFractionY = (object.target.y - originalBounds.top) / originalSize.height;

    const transform: EditableTransform = {
      x: newBounds.left + anchorFractionX * newSize.width,
      y: newBounds.top + anchorFractionY * newSize.height,
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
