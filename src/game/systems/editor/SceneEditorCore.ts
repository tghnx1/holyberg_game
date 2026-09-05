import Phaser from 'phaser';
import {
  RESIZE_HANDLES,
  resizeBoundsFromPointer,
  resizeHandlePoints,
  type ResizeBounds,
  type ResizeHandle,
} from '../levelEditorResize';
import { setSceneEditorActive } from '../sceneEditorState';
import { PASTE_OFFSET } from './editorClipboard';
import {
  boundsContain,
  isCloneable,
  isRemovable,
  isResizable,
  minimumSizeOf,
  shouldPreserveAspect,
  type EditableItem,
  type EditorMarker,
  type EditorPoint,
} from './editorItem';
import {
  boundsSize,
  handleAt,
  markerAt,
  MARKER_RADIUS,
  pickBounds,
  RESIZE_HANDLE_SCREEN,
  scaleBoundsAboutCentre,
  screenToWorldLength,
  translateBounds,
} from './editorGeometry';

/**
 * The shared dev editor core: selection, drag, resize, keyboard controls,
 * copy/paste, delete, outlines and handles, camera pan/zoom, and the on/off
 * lifecycle — for every scene, over the single `EditableItem` contract.
 *
 * It knows nothing about any scene's domain. Berlin's configs and physics
 * zones, a dialogue portrait nested in containers, a club NPC and Level 4's
 * scenery all reach it as items, and every optional member of that contract
 * is a capability the core offers only where the adapter supplies it — which
 * is how copy/paste stays off the single Level 4 backdrop and the main player
 * without the core naming either.
 *
 * ### Coordinate space
 *
 * The overlay graphics is `scrollFactor(1)`: it lives in the same world space
 * as the items it outlines, so camera scroll moves both together. The earlier
 * transform-only editor drew world-space bounds into a `scrollFactor(0)`
 * graphics, which was invisible in the scenes whose camera never scrolls and
 * put every outline and handle a full `scrollX` away from its object in
 * Level 4, whose camera follows the player. Camera *zoom* is the only camera
 * value this file uses, and only to keep strokes, handles and hit tolerances
 * a constant size on screen; the HUD panel and toast are the one exception,
 * being screen-fixed and so needing the inverse zoom applied about the camera
 * centre.
 */

const NUDGE_STEP = 1;
const NUDGE_STEP_FAST = 10;
const SCALE_STEP = 1.05;
const SCALE_STEP_FAST = 1.25;
const PAN_STEP = 120;
const PAN_STEP_FAST = 600;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.08;
const TOAST_MS = 1000;

const COLOR_IDLE = 0x53ffe0;
const COLOR_SELECTED = 0xffe36d;

export interface SceneEditorCoreOptions {
  /** Called when the user presses P while the editor is active. */
  onSave?: () => void;
  /** Camera to pan/zoom; null disables that. Defaults to `scene.cameras.main`. */
  camera?: Phaser.Cameras.Scene2D.Camera | null;
  /** Fired right after E turns the editor on/off, for scenes that freeze their own progression. */
  onEnable?: () => void;
  onDisable?: () => void;
  /** First line of the HUD panel, so a scene can name its own save target. */
  title?: string;
  /** Extra HUD lines under the shortcut list (Berlin's deleted count, say). */
  describe?: () => string[];
}

/** Short, capability-aware controls shown for the current selection. */
export function editorActionHelp(item?: EditableItem): string {
  if (!item) return 'click object to select · drag empty space to pan · wheel to zoom';

  const actions = ['drag move', 'arrows nudge'];
  if (isResizable(item)) actions.push('handles resize · Shift = keep ratio');
  if (isCloneable(item)) actions.push('C copy · V paste');
  if (isRemovable(item)) actions.push('Del delete');
  if (item.bringToFront || item.sendToBack) actions.push('[ / ] layer');
  return actions.join(' · ');
}

interface DragState {
  item: EditableItem;
  startPointer: EditorPoint;
  startBounds: ResizeBounds;
  restore?: () => void;
}

interface MarkerDragState {
  item: EditableItem;
  markerId: string;
  restore?: () => void;
}

interface ResizeState {
  item: EditableItem;
  handle: ResizeHandle;
  originalBounds: ResizeBounds;
  restore?: () => void;
}

interface PanState {
  pointerX: number;
  pointerY: number;
  scrollX: number;
  scrollY: number;
}

export class SceneEditorCore {
  private readonly items = new Map<string, EditableItem>();
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly panel: Phaser.GameObjects.Text;
  private readonly toast: Phaser.GameObjects.Text;
  private readonly sizeLabel: Phaser.GameObjects.Text;
  private readonly camera: Phaser.Cameras.Scene2D.Camera | null;

  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly shiftKey: Phaser.Input.Keyboard.Key;
  private readonly copyKey: Phaser.Input.Keyboard.Key;
  private readonly pasteKey: Phaser.Input.Keyboard.Key;
  private readonly growKeys: Phaser.Input.Keyboard.Key[];
  private readonly shrinkKeys: Phaser.Input.Keyboard.Key[];
  private readonly deleteKeys: Phaser.Input.Keyboard.Key[];
  private readonly escapeKey: Phaser.Input.Keyboard.Key;
  private readonly saveKey: Phaser.Input.Keyboard.Key;
  private readonly raiseKey: Phaser.Input.Keyboard.Key;
  private readonly lowerKey: Phaser.Input.Keyboard.Key;

  private enabled = false;
  private selectedId?: string;
  private drag?: DragState;
  private markerDrag?: MarkerDragState;
  private resizing?: ResizeState;
  private panning?: PanState;
  private clipboardId?: string;
  private status = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: SceneEditorCoreOptions = {},
  ) {
    this.camera = options.camera === undefined ? scene.cameras.main : options.camera;

    // scrollFactor 1: the overlay is drawn in world space, alongside what it
    // outlines. See the class comment — this is the Level 4 alignment fix.
    this.graphics = scene.add
      .graphics()
      .setDepth(10_000)
      .setScrollFactor(1)
      .setVisible(false);

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

    this.sizeLabel = scene.add
      .text(0, 0, '', {
        fontFamily: 'Space Mono',
        fontSize: '13px',
        color: '#120b1d',
        backgroundColor: '#ffe36d',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0, 1)
      .setScrollFactor(1)
      .setDepth(10_001)
      .setVisible(false);

    const keyboard = scene.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.shiftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.copyKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.pasteKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V);
    this.growKeys = [
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS),
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ADD),
    ];
    this.shrinkKeys = [
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS),
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_SUBTRACT),
    ];
    this.deleteKeys = [
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DELETE),
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKSPACE),
    ];
    this.escapeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.saveKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.raiseKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CLOSED_BRACKET);
    this.lowerKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.OPEN_BRACKET);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
  }

  // ------------------------------------------------------------- registry

  get active(): boolean {
    return this.enabled;
  }

  register(item: EditableItem): void {
    this.items.set(item.id, item);
  }

  unregister(id: string): void {
    if (this.selectedId === id) this.selectedId = undefined;
    if (this.clipboardId === id) this.clipboardId = undefined;
    this.items.delete(id);
  }

  /** Replaces the whole set, for a scene whose contents are rebuilt wholesale. */
  setItems(items: readonly EditableItem[]): void {
    this.items.clear();
    for (const item of items) this.items.set(item.id, item);
    if (this.selectedId && !this.items.has(this.selectedId)) this.selectedId = undefined;
  }

  getItems(): EditableItem[] {
    return [...this.items.values()];
  }

  select(id: string | undefined): void {
    this.selectedId = id && this.items.has(id) ? id : undefined;
  }

  getSelectedId(): string | undefined {
    return this.selectedId;
  }

  private selectedItem(): EditableItem | undefined {
    return this.selectedId ? this.items.get(this.selectedId) : undefined;
  }

  private get zoom(): number {
    return this.camera?.zoom ?? 1;
  }

  // ------------------------------------------------------------ lifecycle

  toggle(): void {
    if (this.enabled) this.disable();
    else this.enable();
  }

  /**
   * Opening the editor freezes the scene it is editing.
   *
   * Tweens, the arcade world and the scene clock are all stopped, so a
   * cutscene stops advancing, a character stops walking, animation frames
   * hold, and every `delayedCall` waits — the object under the cursor stays
   * exactly where it is while it is being positioned. Owned here rather than
   * per scene so it is true everywhere, including in a level added later; a
   * scene with progression of its own still gets `onEnable` to freeze that
   * too.
   */
  private enable(): void {
    this.enabled = true;
    this.scene.tweens.pauseAll();
    this.scene.physics?.world?.pause?.();
    this.scene.time.paused = true;
    this.graphics.setVisible(true);
    this.panel.setVisible(true);
    setSceneEditorActive(this.scene, true);
    this.options.onEnable?.();
  }

  private disable(): void {
    this.enabled = false;
    this.scene.time.paused = false;
    this.scene.physics?.world?.resume?.();
    this.scene.tweens.resumeAll();
    this.drag = undefined;
    this.markerDrag = undefined;
    this.resizing = undefined;
    this.panning = undefined;
    this.selectedId = undefined;
    this.graphics.setVisible(false).clear();
    this.panel.setVisible(false);
    this.sizeLabel.setVisible(false);
    setSceneEditorActive(this.scene, false);
    this.options.onDisable?.();
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
    this.sizeLabel.destroy();
    if (this.toastTimer !== undefined) clearTimeout(this.toastTimer);
    this.toastTimer = undefined;
  }

  // ---------------------------------------------------------------- frame

  update(): void {
    if (!this.enabled) return;
    if (Phaser.Input.Keyboard.JustDown(this.escapeKey)) this.cancelEdit();
    if (Phaser.Input.Keyboard.JustDown(this.saveKey)) {
      this.options.onSave?.();
    }
    this.handleLayerKeys();
    if (!this.resizing && !this.drag && !this.markerDrag) {
      this.handleNudgeOrPan();
      this.handleScaleKeys();
    }
    if (Phaser.Input.Keyboard.JustDown(this.copyKey)) this.copySelected();
    if (Phaser.Input.Keyboard.JustDown(this.pasteKey)) this.paste();
    if (this.deleteKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) this.deleteSelected();
    this.redraw();
  }

  /** Esc backs out of whatever is in flight, innermost first. */
  private cancelEdit(): void {
    if (this.resizing) {
      this.resizing.restore?.();
      this.resizing.item.endEdit?.();
      this.resizing = undefined;
      this.sizeLabel.setVisible(false);
      this.status = 'resize cancelled';
      return;
    }
    if (this.markerDrag) {
      this.markerDrag.restore?.();
      this.markerDrag.item.endEdit?.();
      this.markerDrag = undefined;
      this.status = 'drag cancelled';
      return;
    }
    if (this.drag) {
      this.drag.restore?.();
      this.drag.item.endEdit?.();
      this.drag = undefined;
      this.status = 'move cancelled';
      return;
    }
    if (this.selectedId) this.selectedId = undefined;
  }

  private handleLayerKeys(): void {
    const item = this.selectedItem();
    if (!item) return;
    if (item.bringToFront && Phaser.Input.Keyboard.JustDown(this.raiseKey)) item.bringToFront();
    if (item.sendToBack && Phaser.Input.Keyboard.JustDown(this.lowerKey)) item.sendToBack();
  }

  /** Arrows nudge the selection, or scroll the view when nothing is selected. */
  private handleNudgeOrPan(): void {
    const item = this.selectedItem();
    if (!item) {
      if (!this.camera) return;
      const step = this.shiftKey.isDown ? PAN_STEP_FAST : PAN_STEP;
      if (this.cursors.left.isDown) this.camera.scrollX -= step;
      if (this.cursors.right.isDown) this.camera.scrollX += step;
      if (this.cursors.up.isDown) this.camera.scrollY -= step;
      if (this.cursors.down.isDown) this.camera.scrollY += step;
      return;
    }
    const step = this.shiftKey.isDown ? NUDGE_STEP_FAST : NUDGE_STEP;
    let dx = 0;
    let dy = 0;
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) dx -= step;
    if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) dx += step;
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) dy -= step;
    if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) dy += step;
    if (dx === 0 && dy === 0) return;
    item.setBounds(translateBounds(item.getBounds(), dx, dy));
  }

  /** `+`/`-` resize the selection about its own centre. */
  private handleScaleKeys(): void {
    const item = this.selectedItem();
    if (!item || !isResizable(item)) return;
    const grow = this.growKeys.some((key) => Phaser.Input.Keyboard.JustDown(key));
    const shrink = this.shrinkKeys.some((key) => Phaser.Input.Keyboard.JustDown(key));
    if (!grow && !shrink) return;
    const step = this.shiftKey.isDown ? SCALE_STEP_FAST : SCALE_STEP;
    const factor = grow ? step : 1 / step;
    item.setBounds(scaleBoundsAboutCentre(item.getBounds(), factor));
  }

  // ----------------------------------------------------------- copy/paste

  private copySelected(): void {
    const item = this.selectedItem();
    if (!item) return;
    if (!isCloneable(item)) {
      this.status = `${item.label ?? item.id} cannot be copied`;
      return;
    }
    this.clipboardId = item.id;
    this.status = `copied ${item.id}`;
  }

  /** Duplicates the clipboard item through its own `clone`, then selects the copy. */
  private paste(): void {
    if (!this.clipboardId) return;
    const source = this.items.get(this.clipboardId);
    if (!source?.clone) {
      this.status = 'nothing to paste';
      return;
    }
    const newId = source.clone();
    if (!newId) {
      this.status = 'paste failed';
      return;
    }
    const created = this.items.get(newId);
    // Offset so the copy is visibly its own object rather than sitting exactly
    // on the original.
    if (created) {
      created.setBounds(translateBounds(created.getBounds(), PASTE_OFFSET, PASTE_OFFSET));
      this.selectedId = newId;
    }
    this.status = `pasted ${newId}`;
  }

  private deleteSelected(): void {
    const item = this.selectedItem();
    if (!item) return;
    if (!isRemovable(item)) {
      this.status = `${item.label ?? item.id} cannot be deleted`;
      return;
    }
    const id = item.id;
    item.remove?.();
    this.unregister(id);
    this.status = `deleted ${id}`;
  }

  // ----------------------------------------------------------------- input

  private pointerWorld(pointer: Phaser.Input.Pointer): EditorPoint {
    return { x: pointer.worldX, y: pointer.worldY };
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    const world = this.pointerWorld(pointer);
    const selected = this.selectedItem();

    // A selected item's own handles and markers win over whatever is under them.
    if (selected && isResizable(selected)) {
      const handle = handleAt(selected.getBounds(), world, this.zoom);
      if (handle) {
        this.resizing = {
          item: selected,
          handle,
          originalBounds: selected.getBounds(),
          restore: selected.beginEdit?.(),
        };
        this.drag = undefined;
        this.markerDrag = undefined;
        this.panning = undefined;
        return;
      }
    }
    if (selected?.getMarkers && selected.dragMarker) {
      const marker = markerAt(selected.getMarkers(), world, this.zoom);
      if (marker) {
        this.markerDrag = {
          item: selected,
          markerId: marker.id,
          restore: selected.beginEdit?.(),
        };
        this.drag = undefined;
        this.panning = undefined;
        return;
      }
    }

    const hit = this.itemAt(world);
    if (hit) {
      this.selectedId = hit.id;
      this.drag = {
        item: hit,
        startPointer: world,
        startBounds: hit.getBounds(),
        restore: hit.beginEdit?.(),
      };
      this.panning = undefined;
      return;
    }

    // Empty space pans the view. The selection is deliberately kept, so you
    // can scroll to the far end of a level and still paste what you copied.
    this.drag = undefined;
    if (!this.camera) return;
    this.panning = {
      pointerX: pointer.x,
      pointerY: pointer.y,
      scrollX: this.camera.scrollX,
      scrollY: this.camera.scrollY,
    };
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || !pointer.isDown) return;

    if (this.panning && this.camera) {
      // Divided by zoom so a pixel of pointer travel is a pixel of screen
      // travel however far the view is scaled.
      this.camera.scrollX =
        this.panning.scrollX - (pointer.x - this.panning.pointerX) / this.zoom;
      this.camera.scrollY =
        this.panning.scrollY - (pointer.y - this.panning.pointerY) / this.zoom;
      return;
    }

    const world = this.pointerWorld(pointer);

    if (this.resizing) {
      const { item, handle, originalBounds } = this.resizing;
      const bounds = resizeBoundsFromPointer(
        originalBounds,
        handle,
        world,
        minimumSizeOf(item),
        shouldPreserveAspect(item, this.shiftKey.isDown),
      );
      item.setBounds(bounds);
      return;
    }

    if (this.markerDrag) {
      this.markerDrag.item.dragMarker?.(this.markerDrag.markerId, world);
      return;
    }

    if (this.drag) {
      const { item, startPointer, startBounds } = this.drag;
      item.setBounds(
        translateBounds(startBounds, world.x - startPointer.x, world.y - startPointer.y),
      );
    }
  }

  private onPointerUp(): void {
    if (this.resizing) {
      const size = boundsSize(this.resizing.item.getBounds());
      this.status = `resized ${this.resizing.item.id} to ${Math.round(size.width)} × ${Math.round(size.height)}`;
    }
    const edited = this.resizing?.item ?? this.markerDrag?.item ?? this.drag?.item;
    edited?.endEdit?.();
    this.drag = undefined;
    this.markerDrag = undefined;
    this.resizing = undefined;
    this.panning = undefined;
    this.sizeLabel.setVisible(false);
  }

  private onWheel(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || !this.camera) return;
    const step = this.shiftKey.isDown ? ZOOM_STEP * ZOOM_STEP : ZOOM_STEP;
    const factor = pointer.deltaY > 0 ? 1 / step : step;
    this.camera.zoom = Phaser.Math.Clamp(this.camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  }

  /** Topmost item whose pick box contains the point; later-registered wins. */
  private itemAt(world: EditorPoint): EditableItem | undefined {
    const items = [...this.items.values()].reverse();
    return items.find((item) => boundsContain(pickBounds(item.getBounds(), this.zoom), world));
  }

  // --------------------------------------------------------------- drawing

  private redraw(): void {
    const graphics = this.graphics;
    graphics.clear();

    // Outlines are drawn in world units, so every screen-constant size is
    // divided by the zoom.
    const zoom = this.zoom;
    const stroke = screenToWorldLength(1, zoom);

    // Filled as well as outlined: zoomed out, the artwork itself may only be
    // a few pixels, so the box is what you actually see and click.
    graphics.fillStyle(COLOR_IDLE, 0.18);
    graphics.lineStyle(stroke, COLOR_IDLE, 0.5);
    for (const item of this.items.values()) {
      if (item.id === this.selectedId) continue;
      const bounds = pickBounds(item.getBounds(), zoom);
      const { width, height } = boundsSize(bounds);
      graphics.fillRect(bounds.left, bounds.top, width, height);
      graphics.strokeRect(bounds.left, bounds.top, width, height);
    }

    const selected = this.selectedItem();
    if (selected) {
      const bounds = selected.getBounds();
      const { width, height } = boundsSize(bounds);
      graphics.fillStyle(COLOR_SELECTED, 0.3);
      graphics.fillRect(bounds.left, bounds.top, width, height);
      graphics.lineStyle(stroke * 2, COLOR_SELECTED, 1);
      graphics.strokeRect(bounds.left, bounds.top, width, height);

      if (isResizable(selected)) {
        const handleSize = screenToWorldLength(RESIZE_HANDLE_SCREEN, zoom);
        const half = handleSize / 2;
        graphics.fillStyle(COLOR_SELECTED, 1);
        graphics.lineStyle(stroke, 0x120b1d, 1);
        const points = resizeHandlePoints(bounds);
        for (const handle of RESIZE_HANDLES) {
          const point = points[handle];
          graphics.fillRect(point.x - half, point.y - half, handleSize, handleSize);
          graphics.strokeRect(point.x - half, point.y - half, handleSize, handleSize);
        }
      }

      this.drawMarkers(selected, stroke, zoom);

      if (this.resizing) {
        this.sizeLabel
          .setText(`${Math.round(width)} × ${Math.round(height)}`)
          .setPosition(bounds.right + screenToWorldLength(8, zoom), bounds.top - screenToWorldLength(7, zoom))
          .setScale(1 / zoom)
          .setVisible(true);
      } else {
        this.sizeLabel.setVisible(false);
      }
    } else {
      this.sizeLabel.setVisible(false);
    }

    this.panel.setText(this.panelText());
    this.syncOverlayToZoom();
  }

  private drawMarkers(item: EditableItem, stroke: number, zoom: number): void {
    const markers: EditorMarker[] = item.getMarkers?.() ?? [];
    if (markers.length === 0) return;
    const radius = screenToWorldLength(MARKER_RADIUS, zoom);
    if (markers.length >= 2) {
      const [first, last] = [markers[0], markers[markers.length - 1]];
      this.graphics.lineStyle(stroke * 2, COLOR_SELECTED, 0.6);
      this.graphics.lineBetween(first.point.x, first.point.y, last.point.x, last.point.y);
    }
    for (const marker of markers) {
      this.graphics.fillStyle(marker.color, 1);
      this.graphics.fillCircle(marker.point.x, marker.point.y, radius);
    }
  }

  /**
   * Keeps the panel and toast at a fixed screen size and position: a camera
   * zoom scales scrollFactor-0 objects too, so they need the inverse applied
   * about the camera centre.
   */
  private syncOverlayToZoom(): void {
    if (!this.camera) return;
    const zoom = this.zoom;
    const centreX = this.camera.width / 2;
    const centreY = this.camera.height / 2;
    const place = (object: Phaser.GameObjects.Text, screenX: number, screenY: number): void => {
      object.setScale(1 / zoom);
      object.setPosition(centreX + (screenX - centreX) / zoom, centreY + (screenY - centreY) / zoom);
    };
    place(this.panel, 18, 18);
    place(this.toast, centreX, 90);
  }

  private panelText(): string {
    const lines = [this.options.title ?? 'SCENE EDITOR', 'E exit · P save'];
    const item = this.selectedItem();
    if (!item) {
      if (this.status) lines.push(this.status);
      lines.push('click object to select', editorActionHelp());
      return lines.join('\n');
    }
    const bounds = item.getBounds();
    const size = boundsSize(bounds);
    const centreX = (bounds.left + bounds.right) / 2;
    const centreY = (bounds.top + bounds.bottom) / 2;
    lines.push(
      item.kind ? `${item.label ?? item.id}  (${item.kind})` : `${item.label ?? item.id}`,
      editorActionHelp(item),
      this.status ||
        `x ${Math.round(centreX)} · y ${Math.round(centreY)} · w ${Math.round(size.width)} · h ${Math.round(size.height)}`,
    );
    return lines.join('\n');
  }

  /** Screen-fixed confirmation, shown even when the panel is hidden. */
  flash(message: string): void {
    this.toast.setText(message).setVisible(true);
    // Wall-clock, not the scene clock: that one is paused for as long as the
    // editor is open, so a scene-timed toast would never clear.
    if (this.toastTimer !== undefined) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.setVisible(false), TOAST_MS);
  }

  setStatus(message: string): void {
    this.status = message;
  }
}
