import Phaser from 'phaser';
import { Depth } from '../constants';
import type { BuiltEntity } from '../level/berlin/LevelBuilder';
import { getBerlinEntityZoneLayout } from '../level/berlin/entityZoneLayout';
import { getPlatformVisualLayout } from '../level/berlin/platformVisualLayout';
import type { BerlinEntity, MovingPlatformConfig } from '../level/berlin/types';
import {
  RESIZE_HANDLES,
  resizeBoundsFromPointer,
  resizeBoundsSize,
  resizeHandlePoints,
  type MinimumResizeSize,
  type ResizeBounds,
  type ResizeHandle,
} from './levelEditorResize';

/** Entity kinds the editor lets you move; the `finish` trigger is excluded. */
const EDITABLE_TYPES = new Set(['obstacle', 'collectible', 'platform', 'movingPlatform', 'scenery']);

type EditableConfig = Extract<
  BerlinEntity,
  { type: 'obstacle' | 'collectible' | 'platform' | 'movingPlatform' | 'scenery' }
>;

const NUDGE_STEP = 1;
const NUDGE_STEP_FAST = 10;
const MARKER_RADIUS = 11;
/** Multiplier applied per resize keypress; Shift uses the coarser one. */
const SCALE_STEP = 1.05;
const SCALE_STEP_FAST = 1.25;
const MIN_SIZE = 8;
const RESIZE_HANDLE_SCREEN = 9;
/** Where a pasted copy lands relative to the original. */
const PASTE_OFFSET = 40;
/** How long the on-screen confirmation stays up. */
const TOAST_MS = 1000;
/** Local backup only; the JSON file written by SAVE_ENDPOINT is authoritative. */
const STORAGE_KEY = 'holyberg-background-layout';
/** Handled by the dev-only Vite middleware; absent from production builds. */
const SAVE_ENDPOINT = '/__level-editor/save';
/** Camera zoom limits while panning the map; 1 is normal gameplay scale. */
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2;
const ZOOM_STEP = 1.04;
/**
 * Smallest on-screen size an entity is drawn and picked at. Zoomed out, a
 * 48px collectible would be a couple of pixels wide and impossible to hit,
 * so its marker stops shrinking here even though the artwork keeps scaling.
 */
const MIN_PICK_SCREEN = 18;
/** World px the arrow keys pan by when nothing is selected. */
const PAN_STEP = 120;
const PAN_STEP_FAST = 600;

const COLOR_IDLE = 0x53ffe0;
const COLOR_SELECTED = 0xffe36d;
const COLOR_START = 0x7ef0ff;
const COLOR_END = 0xff7ac1;

/**
 * Alpha-content fraction of the full display box, per artSlot, for artwork
 * whose source PNG has transparent padding baked into a canvas larger than
 * the drawn art (measured directly from the source images). Editor outline,
 * hit-testing and resize handles use this to stay tight to what is actually
 * visible; entity.config.width/height (and so the rendered sprite's real
 * display size) are untouched — this only changes what the editor draws and
 * measures against, never the artwork itself.
 *
 * Anything not listed here (collectibles, platforms, and any other obstacle
 * whose art fills its box) falls back to the full config.width/height box
 * exactly as before.
 */
const ART_VISUAL_FRACTIONS: Record<
  string,
  { xRatio: number; yRatio: number; widthRatio: number; heightRatio: number }
> = {
  // Measured as the union of the alpha-content bounds across all four
  // `luk *.png` animation frames (374x609 canvas each), so the outline
  // never clips whichever frame is currently showing.
  'obstacle.homeless': { xRatio: 0.0481, yRatio: 0.11, widthRatio: 0.9171, heightRatio: 0.8112 },
  'obstacle.stinkyCloud': { xRatio: 0.0723, yRatio: 0.374, widthRatio: 0.8691, heightRatio: 0.2227 },
};

interface EditableEntity {
  /** Mutable working copy of the authored config; `P` saves these. */
  config: EditableConfig;
  artwork: Phaser.GameObjects.Container;
  zone: Phaser.GameObjects.Zone;
}

interface Point {
  x: number;
  y: number;
}

type DragTarget = 'body' | 'start' | 'end';

interface ResizeOperation {
  entity: EditableEntity;
  handle: ResizeHandle;
  before: EditableConfig;
  originalBounds: ResizeBounds;
}

export interface LevelEditorHooks {
  /** Builds and registers a brand new entity, used when pasting. */
  spawn: (config: BerlinEntity) => BuiltEntity;
  /** Unregisters and destroys an entity, used when deleting. */
  despawn: (zone: Phaser.GameObjects.Zone) => void;
  /** Detaches the gameplay camera so the editor can pan and zoom freely. */
  releaseCamera: () => void;
  /** Reattaches the gameplay camera and resets the view. */
  restoreCamera: () => void;
}

/**
 * Development-only layout editor for the objects LevelBuilder creates.
 *
 * Everything it touches lives in world coordinates at scrollFactor 1, so the
 * on-screen handles line up with the gameplay objects themselves. Background
 * layers are never included. While inactive it does nothing at all: the scene
 * only calls `update()` once `toggle()` has switched it on.
 */
export class LevelEditorSystem {
  private readonly entities: EditableEntity[];
  /** Authored positions, kept so a saved layout can report what changed. */
  private readonly authored = new Map<string, { x: number; y: number; movementDistance?: number }>();
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly panel: Phaser.GameObjects.Text;
  private readonly toast: Phaser.GameObjects.Text;
  private readonly sizeLabel: Phaser.GameObjects.Text;
  private toastTimer?: Phaser.Time.TimerEvent;
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly shiftKey: Phaser.Input.Keyboard.Key;
  private readonly copyKey: Phaser.Input.Keyboard.Key;
  private readonly pasteKey: Phaser.Input.Keyboard.Key;
  private readonly growKeys: Phaser.Input.Keyboard.Key[];
  private readonly shrinkKeys: Phaser.Input.Keyboard.Key[];
  private readonly deleteKeys: Phaser.Input.Keyboard.Key[];
  private readonly escapeKey: Phaser.Input.Keyboard.Key;

  private selected?: EditableEntity;
  private dragging?: { entity: EditableEntity; target: DragTarget; offsetX: number; offsetY: number };
  private resizing?: ResizeOperation;
  private enabled = false;
  private clipboard?: EditableConfig;
  private pasteCount = 0;
  private readonly deleted: string[] = [];
  private restored = false;
  /** Set while a save is in flight so P cannot stack overlapping requests. */
  private saving = false;
  private panning?: { pointerX: number; pointerY: number; scrollX: number; scrollY: number };
  /** Last action feedback, shown in the panel so a keypress is never silent. */
  private status = '';

  constructor(
    private readonly scene: Phaser.Scene,
    built: readonly BuiltEntity[],
    private readonly hooks: LevelEditorHooks,
  ) {
    this.entities = built
      .filter(({ config }) => EDITABLE_TYPES.has(config.type))
      .map(({ config, artwork, zone }) => ({
        // Deep copy so edits never reach the shared BERLIN_ENTITIES objects
        // or their nested hitbox/movement records.
        config: structuredClone(config) as EditableConfig,
        artwork,
        zone,
      }));

    for (const { config } of this.entities) {
      this.authored.set(config.id, {
        x: config.x,
        y: config.y,
        movementDistance:
          config.type === 'movingPlatform' ? config.movementDistance : undefined,
      });
    }

    this.graphics = this.scene.add
      .graphics()
      .setDepth(Depth.UI - 1)
      .setScrollFactor(1)
      .setVisible(false);

    this.panel = this.scene.add
      .text(18, 18, '', {
        fontFamily: 'Space Mono',
        fontSize: '13px',
        color: '#ffe36d',
        backgroundColor: '#120b1de6',
        padding: { x: 10, y: 8 },
        lineSpacing: 4,
      })
      .setScrollFactor(0)
      .setDepth(Depth.UI + 10)
      .setVisible(false);

    // Screen-fixed confirmation, independent of the panel so it shows even
    // when saveConfig is called from the console with edit mode off.
    this.toast = this.scene.add
      .text(this.scene.scale.width / 2, 90, '', {
        fontFamily: 'Archivo Black',
        fontSize: '26px',
        color: '#120b1d',
        backgroundColor: '#ffe36d',
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(Depth.UI + 11)
      .setVisible(false);

    this.sizeLabel = this.scene.add
      .text(0, 0, '', {
        fontFamily: 'Space Mono',
        fontSize: '13px',
        color: '#120b1d',
        backgroundColor: '#ffe36d',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0, 1)
      .setScrollFactor(1)
      .setDepth(Depth.UI + 9)
      .setVisible(false);

    const keyboard = this.scene.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.shiftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.copyKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.pasteKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V);
    // Both the main-row and numpad variants, so either +/- works.
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

    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);

    // The generated JSON is the level. A localStorage backup is per-browser,
    // so applying it automatically would make the same build show a different
    // level on a phone than on the desktop that edited it.
    if (this.draftRequested()) this.restoreSavedConfig();
    else this.warnAboutUnappliedDraft();
    this.restored = true;
  }

  get active(): boolean {
    return this.enabled;
  }

  /**
   * Reapplies this browser's backup over the loaded level. Nothing is written
   * to the JSON file until P is pressed. Call from the console as
   * `__game.scene.getScene('BerlinScene').editor.restoreDraft()`, or open the
   * game with `?draft=1`.
   */
  restoreDraft(): boolean {
    this.restored = false;
    const before = this.entities.length;
    this.restoreSavedConfig();
    this.restored = true;
    const applied = this.entities.length !== before || this.deleted.length > 0;
    this.flash(applied ? 'DRAFT RESTORED' : 'NO DRAFT FOUND');
    return applied;
  }

  /** Opt-in for an in-progress layout draft: open the game with `?draft=1`. */
  private draftRequested(): boolean {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('draft') === '1';
  }

  private warnAboutUnappliedDraft(): void {
    if (typeof window === 'undefined') return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    console.info(
      `[LevelEditor] A saved layout draft exists in this browser but was NOT applied: ` +
        `berlinLevelConfig.ts is authoritative. Open with ?draft=1 to load the draft, ` +
        `or export it into BERLIN_ENTITIES to make it real for every device.`,
    );
  }

  /** Drops every listener this system registered, for scene shutdown. */
  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    this.toastTimer?.remove();
    this.toastTimer = undefined;
  }

  toggle(): void {
    if (this.enabled) this.disable();
    else this.enable();
  }

  private enable(): void {
    this.enabled = true;
    // Freezing the tween manager stops the moving platforms mid-flight; the
    // snap below then puts them back on their authored centre so what you
    // drag is the position the config actually stores.
    this.scene.tweens.pauseAll();
    this.scene.physics.pause();
    for (const entity of this.entities) {
      if (entity.config.type !== 'movingPlatform') continue;
      this.shift(entity, entity.config.x - entity.artwork.x, entity.config.y - entity.artwork.y);
    }
    this.hooks.releaseCamera();
    this.graphics.setVisible(true);
    this.panel.setVisible(true);
  }

  private disable(): void {
    this.enabled = false;
    this.dragging = undefined;
    this.resizing = undefined;
    this.panning = undefined;
    this.hooks.restoreCamera();
    this.graphics.setVisible(false).clear();
    this.panel.setVisible(false);
    this.sizeLabel.setVisible(false);
    this.scene.physics.resume();
    this.scene.tweens.resumeAll();
  }

  update(): void {
    if (!this.enabled) return;
    if (this.resizing && Phaser.Input.Keyboard.JustDown(this.escapeKey)) this.cancelResize();
    if (!this.resizing) {
      this.handleNudge();
      this.handleResize();
    }
    if (Phaser.Input.Keyboard.JustDown(this.copyKey)) this.copySelected();
    if (Phaser.Input.Keyboard.JustDown(this.pasteKey)) this.paste();
    if (this.deleteKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) this.deleteSelected();
    this.redraw();
  }

  // ---------------------------------------------------------------- moving

  /** Moves the artwork, the zone and its physics body as one. */
  private shift(entity: EditableEntity, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    entity.artwork.x += dx;
    entity.artwork.y += dy;
    entity.zone.x += dx;
    entity.zone.y += dy;

    const body = entity.zone.body;
    if (body instanceof Phaser.Physics.Arcade.StaticBody) body.updateFromGameObject();
    else if (body instanceof Phaser.Physics.Arcade.Body) body.reset(entity.zone.x, entity.zone.y);
  }

  /** Shifts the objects and keeps the working config in step. */
  private moveBy(entity: EditableEntity, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    entity.config.x += dx;
    entity.config.y += dy;
    if (entity.config.type === 'platform' || entity.config.type === 'movingPlatform') {
      entity.config.topY += dy;
    }
    this.shift(entity, dx, dy);
  }

  private handleNudge(): void {
    if (!this.selected) {
      this.handlePan();
      return;
    }
    const step = this.shiftKey.isDown ? NUDGE_STEP_FAST : NUDGE_STEP;
    let dx = 0;
    let dy = 0;
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) dx -= step;
    if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) dx += step;
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) dy -= step;
    if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) dy += step;
    this.moveBy(this.selected, dx, dy);
  }

  /** With nothing selected the arrow keys scroll the map instead. */
  private handlePan(): void {
    const step = this.shiftKey.isDown ? PAN_STEP_FAST : PAN_STEP;
    const camera = this.scene.cameras.main;
    if (this.cursors.left.isDown) camera.scrollX -= step;
    if (this.cursors.right.isDown) camera.scrollX += step;
    if (this.cursors.up.isDown) camera.scrollY -= step;
    if (this.cursors.down.isDown) camera.scrollY += step;
  }

  // -------------------------------------------------------------- resizing

  private handleResize(): void {
    if (!this.selected) return;
    const step = this.shiftKey.isDown ? SCALE_STEP_FAST : SCALE_STEP;
    if (this.growKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) {
      this.resize(this.selected, step);
    }
    if (this.shrinkKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) {
      this.resize(this.selected, 1 / step);
    }
  }

  /**
   * Keyboard resize remains as a convenience, using the same explicit bounds
   * path as pointer handles so visuals, config and physics cannot diverge.
   */
  private resize(entity: EditableEntity, factor: number): void {
    const originalBounds = this.visualBoundsOf(entity);
    const { width, height } = resizeBoundsSize(originalBounds);
    const operation: ResizeOperation = {
      entity,
      handle: 'se',
      before: structuredClone(entity.config),
      originalBounds,
    };
    const grown: ResizeBounds = {
      left: originalBounds.left - (width * factor - width) / 2,
      right: originalBounds.right + (width * factor - width) / 2,
      top: originalBounds.top - (height * factor - height) / 2,
      bottom: originalBounds.bottom + (height * factor - height) / 2,
    };
    this.applyResizeBounds(operation, this.fullBoundsFromVisual(entity, grown));
  }

  private entityBounds(entity: EditableEntity): ResizeBounds {
    const { config } = entity;
    if ((config.type === 'platform' || config.type === 'movingPlatform') && !config.editorSized) {
      const layout = getPlatformVisualLayout(config);
      if (layout) {
        return {
          left: config.x - layout.visibleDeckWidth / 2,
          right: config.x + layout.visibleDeckWidth / 2,
          top: config.topY,
          bottom: config.topY + layout.visibleDeckThickness,
        };
      }
    }
    return {
      left: config.x - config.width / 2,
      right: config.x + config.width / 2,
      top: config.y - config.height / 2,
      bottom: config.y + config.height / 2,
    };
  }

  /**
   * `entityBounds`, narrowed to the actually-visible art for any artSlot
   * registered in ART_VISUAL_FRACTIONS. Selection, hit-testing, the drawn
   * outline and resize handles all read this instead of `entityBounds`
   * directly, so a padded PNG's transparent margin never inflates any of
   * them. Falls back to the full box unchanged when no fraction applies.
   */
  private visualBoundsOf(entity: EditableEntity): ResizeBounds {
    const full = this.entityBounds(entity);
    const fraction = ART_VISUAL_FRACTIONS[entity.config.artSlot];
    if (!fraction) return full;
    const fullWidth = full.right - full.left;
    const fullHeight = full.bottom - full.top;
    return {
      left: full.left + fraction.xRatio * fullWidth,
      right: full.left + (fraction.xRatio + fraction.widthRatio) * fullWidth,
      top: full.top + fraction.yRatio * fullHeight,
      bottom: full.top + (fraction.yRatio + fraction.heightRatio) * fullHeight,
    };
  }

  /**
   * Inverse of `visualBoundsOf`: expands a resized *visual* bounds box back
   * out to the equivalent full display-box bounds, so a drag on the tight
   * handles still resizes the whole artwork (and `config.width/height`, the
   * real display size) proportionally, rather than shrinking the config down
   * to just the visible-content box.
   */
  private fullBoundsFromVisual(entity: EditableEntity, visual: ResizeBounds): ResizeBounds {
    const fraction = ART_VISUAL_FRACTIONS[entity.config.artSlot];
    if (!fraction) return visual;
    const visualWidth = visual.right - visual.left;
    const visualHeight = visual.bottom - visual.top;
    const fullWidth = visualWidth / fraction.widthRatio;
    const fullHeight = visualHeight / fraction.heightRatio;
    const fullLeft = visual.left - fraction.xRatio * fullWidth;
    const fullTop = visual.top - fraction.yRatio * fullHeight;
    return { left: fullLeft, right: fullLeft + fullWidth, top: fullTop, bottom: fullTop + fullHeight };
  }

  private minimumSize(config: EditableConfig): MinimumResizeSize {
    if (config.type === 'platform' || config.type === 'movingPlatform') {
      return { width: 48, height: MIN_SIZE };
    }
    if (config.type === 'obstacle') return { width: 16, height: 12 };
    return { width: 12, height: 12 };
  }

  private resizeHandleAt(world: Point, entity: EditableEntity): ResizeHandle | undefined {
    const tolerance = (RESIZE_HANDLE_SCREEN + 4) / this.scene.cameras.main.zoom;
    const points = resizeHandlePoints(this.visualBoundsOf(entity));
    return RESIZE_HANDLES.find(
      (handle) =>
        Phaser.Math.Distance.Between(world.x, world.y, points[handle].x, points[handle].y) <=
        tolerance,
    );
  }

  private applyResizeBounds(operation: ResizeOperation, bounds: ResizeBounds): void {
    const entity = operation.entity;
    const before = operation.before;
    const minimum = this.minimumSize(before);
    const width = Math.max(minimum.width, Math.round(bounds.right - bounds.left));
    const height = Math.max(minimum.height, Math.round(bounds.bottom - bounds.top));
    const x = Math.round((bounds.left + bounds.right) / 2);
    const y = Math.round((bounds.top + bounds.bottom) / 2);
    const dx = x - entity.config.x;
    const dy = y - entity.config.y;

    entity.config.x = x;
    entity.config.y = y;
    entity.config.width = width;
    entity.config.height = height;
    if (entity.config.type === 'platform' || entity.config.type === 'movingPlatform') {
      entity.config.topY = Math.round(y - height / 2);
      entity.config.editorSized = true;
    } else if (entity.config.type === 'obstacle' && before.type === 'obstacle') {
      const scaleX = width / Math.max(1, before.width);
      const scaleY = height / Math.max(1, before.height);
      entity.config.hitbox.width = Math.max(1, Math.round(before.hitbox.width * scaleX));
      entity.config.hitbox.height = Math.max(1, Math.round(before.hitbox.height * scaleY));
      entity.config.hitbox.offsetX = Math.round(before.hitbox.offsetX * scaleX);
      entity.config.hitbox.offsetY = Math.round(before.hitbox.offsetY * scaleY);
    }

    this.shift(entity, dx, dy);
    this.refreshArtwork(entity);
    this.syncZoneToConfig(entity);
  }

  private refreshArtwork(entity: EditableEntity): void {
    const resizeVisual = entity.artwork.getData('resizeVisual') as
      | ((config: BerlinEntity) => void)
      | undefined;
    if (resizeVisual) {
      resizeVisual(entity.config);
      return;
    }
    const primary =
      (entity.artwork.getData('primaryVisual') as Phaser.GameObjects.GameObject | undefined) ??
      entity.artwork.list[0];
    if (primary instanceof Phaser.GameObjects.Rectangle)
      primary.setSize(entity.config.width, entity.config.height);
    else if (primary instanceof Phaser.GameObjects.Image)
      primary.setDisplaySize(entity.config.width, entity.config.height);
  }

  private syncZoneToConfig(entity: EditableEntity): void {
    const layout = getBerlinEntityZoneLayout(entity.config);
    const zone = entity.zone;
    zone.setPosition(layout.x, layout.y).setSize(layout.width, layout.height);
    const body = zone.body;
    if (body instanceof Phaser.Physics.Arcade.StaticBody) {
      body.setSize(layout.width, layout.height);
      body.updateFromGameObject();
    } else if (body instanceof Phaser.Physics.Arcade.Body) {
      body.setSize(layout.width, layout.height);
      body.reset(layout.x, layout.y);
    }
  }

  private cancelResize(): void {
    const operation = this.resizing;
    if (!operation) return;
    const entity = operation.entity;
    const current = entity.config;
    const restored = structuredClone(operation.before);
    this.shift(entity, restored.x - current.x, restored.y - current.y);
    entity.config = restored;
    this.refreshArtwork(entity);
    this.syncZoneToConfig(entity);
    this.resizing = undefined;
    this.sizeLabel.setVisible(false);
    this.status = 'resize cancelled';
  }

  // ------------------------------------------------------------ copy/paste

  private copySelected(): void {
    if (!this.selected) return;
    this.clipboard = structuredClone(this.selected.config);
    this.status = `copied ${this.clipboard.id}`;
  }

  /** Spawns a live duplicate of the clipboard entity and selects it. */
  private paste(): void {
    if (!this.clipboard) return;
    this.pasteCount += 1;
    const config = structuredClone(this.clipboard);
    config.id = this.uniqueId(this.clipboard.id);
    config.x += PASTE_OFFSET;
    config.y += PASTE_OFFSET;
    if (config.type === 'platform' || config.type === 'movingPlatform') {
      config.topY += PASTE_OFFSET;
    }

    this.selected = this.addEntity(config);
    this.status = `pasted ${config.id}`;
  }

  /** Builds a live entity and starts tracking it. */
  private addEntity(config: EditableConfig): EditableEntity {
    const built = this.hooks.spawn(config);
    const entity: EditableEntity = { config, artwork: built.artwork, zone: built.zone };
    this.entities.push(entity);
    // Recorded as authored at its spawn position, so the saved diff only
    // reports movement applied afterwards.
    this.authored.set(config.id, {
      x: config.x,
      y: config.y,
      movementDistance: config.type === 'movingPlatform' ? config.movementDistance : undefined,
    });
    return entity;
  }

  /** Destroys the selection and drops it from the saved config. */
  private deleteSelected(): void {
    const entity = this.selected;
    if (!entity) return;
    this.deleted.push(entity.config.id);
    this.removeEntity(entity);
    this.status = `deleted ${entity.config.id}`;
  }

  private removeEntity(entity: EditableEntity): void {
    const index = this.entities.indexOf(entity);
    if (index >= 0) this.entities.splice(index, 1);
    this.authored.delete(entity.config.id);
    if (this.selected === entity) this.selected = undefined;
    if (this.dragging?.entity === entity) this.dragging = undefined;
    if (this.resizing?.entity === entity) this.resizing = undefined;
    this.hooks.despawn(entity.zone);
  }

  private uniqueId(base: string): string {
    const taken = new Set(this.entities.map(({ config }) => config.id));
    let candidate = `${base}-copy`;
    let suffix = this.pasteCount;
    while (taken.has(candidate)) {
      suffix += 1;
      candidate = `${base}-copy-${suffix}`;
    }
    return candidate;
  }

  // -------------------------------------------------------- moving platform

  /** The two ends of a moving platform's travel, in world coordinates. */
  private extremes(config: MovingPlatformConfig): { start: Point; end: Point } {
    const half = config.movementDistance / 2;
    return config.axis === 'horizontal'
      ? { start: { x: config.x - half, y: config.y }, end: { x: config.x + half, y: config.y } }
      : { start: { x: config.x, y: config.y - half }, end: { x: config.x, y: config.y + half } };
  }

  /**
   * Drags one end of the travel while the other stays put, which changes both
   * the centre the config stores and the movement distance.
   */
  private dragExtreme(entity: EditableEntity, which: 'start' | 'end', world: Point): void {
    const config = entity.config;
    if (config.type !== 'movingPlatform') return;
    const horizontal = config.axis === 'horizontal';
    const { start, end } = this.extremes(config);
    const moved = Math.round(horizontal ? world.x : world.y);
    const anchor = horizontal
      ? which === 'start'
        ? end.x
        : start.x
      : which === 'start'
        ? end.y
        : start.y;

    config.movementDistance = Math.abs(anchor - moved);
    const centre = (moved + anchor) / 2;
    const delta = centre - (horizontal ? config.x : config.y);
    this.moveBy(entity, horizontal ? delta : 0, horizontal ? 0 : delta);
  }

  // ----------------------------------------------------------------- input

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    const world = { x: pointer.worldX, y: pointer.worldY };

    const selected = this.selected;
    const resizeHandle = selected ? this.resizeHandleAt(world, selected) : undefined;
    if (selected && resizeHandle) {
      this.resizing = {
        entity: selected,
        handle: resizeHandle,
        before: structuredClone(selected.config),
        originalBounds: this.visualBoundsOf(selected),
      };
      this.dragging = undefined;
      this.panning = undefined;
      return;
    }

    // A selected moving platform's travel handles win over the object underneath.
    if (selected && selected.config.type === 'movingPlatform') {
      const { start, end } = this.extremes(selected.config);
      if (this.withinMarker(world, start)) {
        this.dragging = { entity: selected, target: 'start', offsetX: 0, offsetY: 0 };
        return;
      }
      if (this.withinMarker(world, end)) {
        this.dragging = { entity: selected, target: 'end', offsetX: 0, offsetY: 0 };
        return;
      }
    }

    const hit = this.entityAt(world);
    if (hit) {
      this.selected = hit;
      this.dragging = {
        entity: hit,
        target: 'body',
        offsetX: world.x - hit.config.x,
        offsetY: world.y - hit.config.y,
      };
      return;
    }

    // Empty space drags the view instead of the level. The selection is kept
    // so you can pan to the far end of the map and still paste what you copied.
    const camera = this.scene.cameras.main;
    this.dragging = undefined;
    this.panning = {
      pointerX: pointer.x,
      pointerY: pointer.y,
      scrollX: camera.scrollX,
      scrollY: camera.scrollY,
    };
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || !pointer.isDown) return;

    if (this.panning) {
      const camera = this.scene.cameras.main;
      // Divide by zoom so a pixel of pointer travel is a pixel of screen
      // travel whatever the view is scaled to.
      camera.scrollX = this.panning.scrollX - (pointer.x - this.panning.pointerX) / camera.zoom;
      camera.scrollY = this.panning.scrollY - (pointer.y - this.panning.pointerY) / camera.zoom;
      return;
    }

    if (this.resizing) {
      const world = { x: pointer.worldX, y: pointer.worldY };
      const bounds = resizeBoundsFromPointer(
        this.resizing.originalBounds,
        this.resizing.handle,
        world,
        this.minimumSize(this.resizing.before),
        this.shiftKey.isDown,
      );
      this.applyResizeBounds(this.resizing, this.fullBoundsFromVisual(this.resizing.entity, bounds));
      return;
    }

    if (!this.dragging) return;
    const world = { x: pointer.worldX, y: pointer.worldY };
    const { entity, target, offsetX, offsetY } = this.dragging;
    if (target === 'body') {
      const x = Math.round(world.x - offsetX);
      const y = Math.round(world.y - offsetY);
      this.moveBy(entity, x - entity.config.x, y - entity.config.y);
      return;
    }
    this.dragExtreme(entity, target, world);
  }

  private onPointerUp(): void {
    if (this.resizing) {
      const { width, height } = resizeBoundsSize(this.visualBoundsOf(this.resizing.entity));
      this.status = `resized ${this.resizing.entity.config.id} to ${Math.round(width)} × ${Math.round(height)}`;
    }
    this.dragging = undefined;
    this.resizing = undefined;
    this.panning = undefined;
    this.sizeLabel.setVisible(false);
  }

  /** Wheel zooms the map view around its centre. */
  private onWheel(
    _pointer: Phaser.Input.Pointer,
    _over: unknown,
    _dx: number,
    dy: number,
  ): void {
    if (!this.enabled) return;
    const camera = this.scene.cameras.main;
    const factor = dy > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    camera.setZoom(Phaser.Math.Clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM));
  }

  /**
   * Keeps the panel and toast at a fixed screen size and position. A camera
   * zoom scales scrollFactor-0 objects too, so they need the inverse applied
   * about the camera centre.
   */
  private syncOverlayToZoom(): void {
    const camera = this.scene.cameras.main;
    const zoom = camera.zoom;
    const centreX = camera.width / 2;
    const centreY = camera.height / 2;
    const place = (object: Phaser.GameObjects.Text, screenX: number, screenY: number): void => {
      object.setScale(1 / zoom);
      object.setPosition(centreX + (screenX - centreX) / zoom, centreY + (screenY - centreY) / zoom);
    };
    place(this.panel, 18, 18);
    place(this.toast, centreX, 90);
  }

  private withinMarker(world: Point, marker: Point): boolean {
    const tolerance = (MARKER_RADIUS + 4) / this.scene.cameras.main.zoom;
    return Phaser.Math.Distance.Between(world.x, world.y, marker.x, marker.y) <= tolerance;
  }

  /**
   * `visualBoundsOf`, floored to MIN_PICK_SCREEN (about the tight box's own
   * centre, not the entity's authored x/y — a padded PNG's visible content
   * is not necessarily centred in its box) so nothing becomes unpickable
   * zoomed out.
   */
  private pickBounds(entity: EditableEntity): ResizeBounds {
    const bounds = this.visualBoundsOf(entity);
    const minimum = MIN_PICK_SCREEN / this.scene.cameras.main.zoom;
    const growX = Math.max(0, minimum - (bounds.right - bounds.left)) / 2;
    const growY = Math.max(0, minimum - (bounds.bottom - bounds.top)) / 2;
    return {
      left: bounds.left - growX,
      right: bounds.right + growX,
      top: bounds.top - growY,
      bottom: bounds.bottom + growY,
    };
  }

  /** Topmost editable entity whose marker rectangle contains the point. */
  private entityAt(world: Point): EditableEntity | undefined {
    for (let index = this.entities.length - 1; index >= 0; index -= 1) {
      const entity = this.entities[index];
      const bounds = this.pickBounds(entity);
      if (world.x >= bounds.left && world.x <= bounds.right && world.y >= bounds.top && world.y <= bounds.bottom) {
        return entity;
      }
    }
    return undefined;
  }

  // --------------------------------------------------------------- drawing

  private redraw(): void {
    const graphics = this.graphics;
    graphics.clear();

    // Outlines and handles are drawn in world units, so everything gets
    // divided by the zoom to stay a constant size on screen.
    const zoom = this.scene.cameras.main.zoom;
    const stroke = 1 / zoom;
    const markerRadius = MARKER_RADIUS / zoom;

    // Filled as well as outlined: zoomed out, the artwork itself is only a
    // few pixels, so the marker is what you actually see and click.
    graphics.fillStyle(COLOR_IDLE, 0.18);
    graphics.lineStyle(stroke, COLOR_IDLE, 0.5);
    for (const entity of this.entities) {
      const bounds = this.pickBounds(entity);
      graphics.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
      graphics.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    }

    const selected = this.selected;
    if (selected) {
      const { config } = selected;
      const bounds = this.visualBoundsOf(selected);
      const { width, height } = resizeBoundsSize(bounds);
      graphics.fillStyle(COLOR_SELECTED, 0.3);
      graphics.fillRect(bounds.left, bounds.top, width, height);
      graphics.lineStyle(stroke * 2, COLOR_SELECTED, 1);
      graphics.strokeRect(bounds.left, bounds.top, width, height);

      const handleSize = RESIZE_HANDLE_SCREEN / zoom;
      const halfHandle = handleSize / 2;
      graphics.fillStyle(COLOR_SELECTED, 1);
      graphics.lineStyle(stroke, 0x120b1d, 1);
      const handlePoints = resizeHandlePoints(bounds);
      for (const handle of RESIZE_HANDLES) {
        const point = handlePoints[handle];
        graphics.fillRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
        graphics.strokeRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
      }

      if (config.type === 'movingPlatform') {
        const { start, end } = this.extremes(config);
        graphics.lineStyle(stroke * 2, COLOR_SELECTED, 0.6);
        graphics.lineBetween(start.x, start.y, end.x, end.y);
        graphics.fillStyle(COLOR_START, 1);
        graphics.fillCircle(start.x, start.y, markerRadius);
        graphics.fillStyle(COLOR_END, 1);
        graphics.fillCircle(end.x, end.y, markerRadius);
      }

      if (this.resizing) {
        this.sizeLabel
          .setText(`${Math.round(width)} × ${Math.round(height)}`)
          .setPosition(bounds.right + 8 / zoom, bounds.top - 7 / zoom)
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

  private panelText(): string {
    const lines = [
      'LEVEL EDITOR  —  E exit   P save to berlinLevel.generated.json',
      'click select · drag move · arrows 1px · shift+arrows 10px',
      'drag handles resize · Shift lock aspect · Esc cancel',
      '+/- proportional resize (shift = coarse) · C copy · V paste · del remove',
      'drag empty space to scroll · wheel to zoom · arrows scroll when nothing selected',
    ];
    if (this.deleted.length) lines.push(`${this.deleted.length} deleted`);
    if (this.status) lines.push(this.status);
    const camera = this.scene.cameras.main;
    lines.push(
      `view x ${Math.round(camera.scrollX)}-${Math.round(camera.scrollX + camera.width / camera.zoom)}` +
        `   zoom ${camera.zoom.toFixed(2)}`,
    );
    const selected = this.selected;
    if (!selected) {
      lines.push('', 'no selection');
      return lines.join('\n');
    }
    const { config } = selected;
    const size = resizeBoundsSize(this.visualBoundsOf(selected));
    lines.push(
      '',
      `${config.id}  (${config.type})`,
      `x ${Math.round(config.x)}   y ${Math.round(config.y)}`,
      `w ${Math.round(size.width)}   h ${Math.round(size.height)}`,
    );
    if (config.type === 'movingPlatform') {
      const { start, end } = this.extremes(config);
      lines.push(
        `axis ${config.axis}   distance ${Math.round(config.movementDistance)}`,
        `start ${Math.round(start.x)},${Math.round(start.y)}   end ${Math.round(end.x)},${Math.round(end.y)}`,
      );
    }
    return lines.join('\n');
  }

  // --------------------------------------------------------------- output

  /**
   * Persists the layout to localStorage, logs it, and flashes a confirmation
   * so the shortcut is never silent even with devtools closed. Public so it
   * can also be driven from the console:
   * `__game.scene.getScene('BerlinScene').editor.saveConfig()`.
   */
  saveConfig(): void {
    if (this.saving) {
      this.flash('SAVE ALREADY IN PROGRESS');
      return;
    }
    const config = this.entities.map(({ config: entity }) => entity);
    const json = JSON.stringify(config, null, 2);
    console.log(json);

    // Backup first: if the request fails the work is still recoverable from
    // this browser via restoreDraft().
    try {
      window.localStorage.setItem(STORAGE_KEY, json);
    } catch {
      console.warn('[LevelEditor] could not write the localStorage backup');
    }

    this.saving = true;
    this.flash('SAVING…');
    void fetch(SAVE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
        this.flash('CONFIG SAVED TO FILE');
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        // A refused connection means the Vite dev server is not running, which
        // is by far the most common cause and not obvious from "Failed to fetch".
        const hint =
          error instanceof TypeError
            ? ' Is `npm run dev` running? The save endpoint only exists on the dev server.'
            : '';
        console.error(
          `[LevelEditor] save to ${SAVE_ENDPOINT} failed: ${message}.${hint} ` +
            'The layout is still in this browser; call restoreDraft() to reapply it.',
        );
        this.flash('SAVE FAILED — SEE CONSOLE');
      })
      .finally(() => {
        this.saving = false;
      });
  }

  /**
   * Reapplies a previously saved layout. The stored snapshot is authoritative:
   * entities it doesn't mention were deleted and are removed again, and ones
   * the scene lacks were pasted and get rebuilt.
   */
  private restoreSavedConfig(): void {
    if (this.restored) return;
    let saved: EditableConfig[];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      saved = parsed as EditableConfig[];
    } catch {
      return;
    }

    const validSaved = saved.filter(
      (config): config is EditableConfig => Boolean(config && typeof config.id === 'string'),
    );
    const byId = new Map(this.entities.map((entity) => [entity.config.id, entity]));
    const savedIds = new Set(validSaved.map((config) => config.id));

    for (const entity of [...this.entities]) {
      if (!savedIds.has(entity.config.id)) this.removeEntity(entity);
    }

    for (const config of validSaved) {
      const existing = byId.get(config.id);
      if (existing) this.applyConfig(existing, config);
      else if (this.hasValidSize(config)) this.addEntity(structuredClone(config));
    }
  }

  /** Moves and resizes an entity to match a stored config. */
  private applyConfig(entity: EditableEntity, saved: EditableConfig): void {
    const current = entity.config;
    const normalized = structuredClone(saved);
    // Drafts made before resize support may omit explicit dimensions. Use the
    // authored values for those fields, preserving old browser layouts.
    if (!Number.isFinite(normalized.width) || normalized.width <= 0) normalized.width = current.width;
    if (!Number.isFinite(normalized.height) || normalized.height <= 0)
      normalized.height = current.height;
    if (normalized.type === 'obstacle' && current.type === 'obstacle' && !normalized.hitbox) {
      normalized.hitbox = structuredClone(current.hitbox);
    }
    const dx = normalized.x - current.x;
    const dy = normalized.y - current.y;

    entity.config = normalized;
    this.shift(entity, dx, dy);
    this.refreshArtwork(entity);
    this.syncZoneToConfig(entity);
    this.authored.set(normalized.id, {
      x: normalized.x,
      y: normalized.y,
      movementDistance:
        normalized.type === 'movingPlatform' ? normalized.movementDistance : undefined,
    });
  }

  private hasValidSize(config: EditableConfig): boolean {
    return (
      Number.isFinite(config.width) &&
      config.width > 0 &&
      Number.isFinite(config.height) &&
      config.height > 0
    );
  }

  private flash(message: string): void {
    this.toast.setText(message).setVisible(true);
    this.toastTimer?.remove();
    this.toastTimer = this.scene.time.delayedCall(TOAST_MS, () => this.toast.setVisible(false));
  }
}
