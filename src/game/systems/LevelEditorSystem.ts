import Phaser from 'phaser';
import { Depth } from '../constants';
import type { BuiltEntity } from '../level/berlin/LevelBuilder';
import type { BerlinEntity, MovingPlatformConfig } from '../level/berlin/types';

/** Entity kinds the editor lets you move; `finish` and scenery are excluded. */
const EDITABLE_TYPES = new Set(['obstacle', 'collectible', 'platform', 'movingPlatform']);

type EditableConfig = Extract<
  BerlinEntity,
  { type: 'obstacle' | 'collectible' | 'platform' | 'movingPlatform' }
>;

const NUDGE_STEP = 1;
const NUDGE_STEP_FAST = 10;
const MARKER_RADIUS = 11;
/** Multiplier applied per resize keypress; Shift uses the coarser one. */
const SCALE_STEP = 1.05;
const SCALE_STEP_FAST = 1.25;
const MIN_SIZE = 8;
/** Where a pasted copy lands relative to the original. */
const PASTE_OFFSET = 40;
/** How long the on-screen confirmation stays up. */
const TOAST_MS = 1000;
/** Where `P` persists the layout, and where entering layout mode reads it. */
const STORAGE_KEY = 'holyberg-background-layout';
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
  private toastTimer?: Phaser.Time.TimerEvent;
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly shiftKey: Phaser.Input.Keyboard.Key;
  private readonly copyKey: Phaser.Input.Keyboard.Key;
  private readonly pasteKey: Phaser.Input.Keyboard.Key;
  private readonly growKeys: Phaser.Input.Keyboard.Key[];
  private readonly shrinkKeys: Phaser.Input.Keyboard.Key[];
  private readonly deleteKeys: Phaser.Input.Keyboard.Key[];

  private selected?: EditableEntity;
  private dragging?: { entity: EditableEntity; target: DragTarget; offsetX: number; offsetY: number };
  private enabled = false;
  private clipboard?: EditableConfig;
  private pasteCount = 0;
  private readonly deleted: string[] = [];
  private restored = false;
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

    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);

    // BERLIN_ENTITIES is the authoritative layout. A localStorage draft is
    // per-browser, so applying it automatically made the same build show a
    // different level on a phone than on the desktop that edited it, and let a
    // stale draft mask later source edits. It now loads only on request.
    if (this.draftRequested()) this.restoreSavedConfig();
    else this.warnAboutUnappliedDraft();
    this.restored = true;
  }

  get active(): boolean {
    return this.enabled;
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
    this.panning = undefined;
    this.hooks.restoreCamera();
    this.graphics.setVisible(false).clear();
    this.panel.setVisible(false);
    this.scene.physics.resume();
    this.scene.tweens.resumeAll();
  }

  update(): void {
    if (!this.enabled) return;
    this.handleNudge();
    this.handleResize();
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
   * Scales the config, the artwork and the physics body by the same factor,
   * keeping the object centred on its current position.
   */
  private resize(entity: EditableEntity, factor: number): void {
    const config = entity.config;
    const width = Math.max(MIN_SIZE, Math.round(config.width * factor));
    const height = Math.max(MIN_SIZE, Math.round(config.height * factor));
    if (width === config.width && height === config.height) return;
    const scaleX = width / config.width;
    const scaleY = height / config.height;
    config.width = width;
    config.height = height;

    // A platform's landing surface is its top edge, so it follows the height.
    if (config.type === 'platform' || config.type === 'movingPlatform') {
      config.topY = Math.round(config.y - height / 2);
    }
    if (config.type === 'obstacle') {
      config.hitbox.width = Math.round(config.hitbox.width * scaleX);
      config.hitbox.height = Math.round(config.hitbox.height * scaleY);
      config.hitbox.offsetX = Math.round(config.hitbox.offsetX * scaleX);
      config.hitbox.offsetY = Math.round(config.hitbox.offsetY * scaleY);
    }

    this.applyArtworkSize(entity, width, height);
    this.resizeZone(entity, scaleX, scaleY);
  }

  /**
   * PlaceholderFactory puts the sized image or rectangle first in the
   * container; the optional debug label after it keeps its own size.
   */
  private applyArtworkSize(entity: EditableEntity, width: number, height: number): void {
    const body = entity.artwork.list[0];
    if (body instanceof Phaser.GameObjects.Rectangle) body.setSize(width, height);
    else if (body instanceof Phaser.GameObjects.Image) body.setDisplaySize(width, height);
  }

  private resizeZone(entity: EditableEntity, scaleX: number, scaleY: number): void {
    const zone = entity.zone;
    const width = Math.max(MIN_SIZE, Math.round(zone.width * scaleX));
    const height = Math.max(MIN_SIZE, Math.round(zone.height * scaleY));
    zone.setSize(width, height);
    const body = zone.body;
    if (body instanceof Phaser.Physics.Arcade.StaticBody) {
      body.setSize(width, height);
      body.updateFromGameObject();
    } else if (body instanceof Phaser.Physics.Arcade.Body) {
      body.setSize(width, height);
      body.reset(zone.x, zone.y);
    }
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

    // A selected moving platform's handles win over the object underneath.
    const selected = this.selected;
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
    this.dragging = undefined;
    this.panning = undefined;
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
   * Half-width/height an entity occupies for drawing and picking, never
   * smaller than MIN_PICK_SCREEN once the zoom is taken into account.
   */
  private pickExtents(config: EditableConfig): { halfWidth: number; halfHeight: number } {
    const minimum = MIN_PICK_SCREEN / this.scene.cameras.main.zoom;
    return {
      halfWidth: Math.max(config.width, minimum) / 2,
      halfHeight: Math.max(config.height, minimum) / 2,
    };
  }

  /** Topmost editable entity whose marker rectangle contains the point. */
  private entityAt(world: Point): EditableEntity | undefined {
    for (let index = this.entities.length - 1; index >= 0; index -= 1) {
      const { config } = this.entities[index];
      const { halfWidth, halfHeight } = this.pickExtents(config);
      if (Math.abs(world.x - config.x) <= halfWidth && Math.abs(world.y - config.y) <= halfHeight) {
        return this.entities[index];
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
    for (const { config } of this.entities) {
      const { halfWidth, halfHeight } = this.pickExtents(config);
      graphics.fillRect(config.x - halfWidth, config.y - halfHeight, halfWidth * 2, halfHeight * 2);
      graphics.strokeRect(config.x - halfWidth, config.y - halfHeight, halfWidth * 2, halfHeight * 2);
    }

    const selected = this.selected;
    if (selected) {
      const { config } = selected;
      const { halfWidth, halfHeight } = this.pickExtents(config);
      graphics.fillStyle(COLOR_SELECTED, 0.3);
      graphics.fillRect(config.x - halfWidth, config.y - halfHeight, halfWidth * 2, halfHeight * 2);
      graphics.lineStyle(stroke * 2, COLOR_SELECTED, 1);
      graphics.strokeRect(config.x - halfWidth, config.y - halfHeight, halfWidth * 2, halfHeight * 2);

      if (config.type === 'movingPlatform') {
        const { start, end } = this.extremes(config);
        graphics.lineStyle(stroke * 2, COLOR_SELECTED, 0.6);
        graphics.lineBetween(start.x, start.y, end.x, end.y);
        graphics.fillStyle(COLOR_START, 1);
        graphics.fillCircle(start.x, start.y, markerRadius);
        graphics.fillStyle(COLOR_END, 1);
        graphics.fillCircle(end.x, end.y, markerRadius);
      }
    }

    this.panel.setText(this.panelText());
    this.syncOverlayToZoom();
  }

  private panelText(): string {
    const lines = [
      'LEVEL EDITOR  —  E exit   P save draft (localStorage, this browser only)',
      'click select · drag move · arrows 1px · shift+arrows 10px',
      '+/- resize (shift = coarse) · C copy · V paste · del remove',
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
    lines.push(
      '',
      `${config.id}  (${config.type})`,
      `x ${Math.round(config.x)}   y ${Math.round(config.y)}`,
      `w ${config.width}   h ${config.height}`,
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
    const config = this.entities.map(({ config: entity }) => entity);
    const json = JSON.stringify(config, null, 2);
    console.log(json);
    try {
      window.localStorage.setItem(STORAGE_KEY, json);
      this.flash('CONFIG SAVED');
    } catch {
      // Private browsing or a full quota; the console copy is still there.
      this.flash('SAVE FAILED — SEE CONSOLE');
    }
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

    const byId = new Map(this.entities.map((entity) => [entity.config.id, entity]));
    const savedIds = new Set(saved.map((config) => config.id));

    for (const entity of [...this.entities]) {
      if (!savedIds.has(entity.config.id)) this.removeEntity(entity);
    }

    for (const config of saved) {
      if (!config || typeof config.id !== 'string') continue;
      const existing = byId.get(config.id);
      if (existing) this.applyConfig(existing, config);
      else this.addEntity(structuredClone(config));
    }
  }

  /** Moves and resizes an entity to match a stored config. */
  private applyConfig(entity: EditableEntity, saved: EditableConfig): void {
    const current = entity.config;
    const dx = saved.x - current.x;
    const dy = saved.y - current.y;
    const scaleX = current.width === 0 ? 1 : saved.width / current.width;
    const scaleY = current.height === 0 ? 1 : saved.height / current.height;

    entity.config = structuredClone(saved);
    this.shift(entity, dx, dy);
    if (scaleX !== 1 || scaleY !== 1) {
      this.applyArtworkSize(entity, saved.width, saved.height);
      this.resizeZone(entity, scaleX, scaleY);
    }
    this.authored.set(saved.id, {
      x: saved.x,
      y: saved.y,
      movementDistance: saved.type === 'movingPlatform' ? saved.movementDistance : undefined,
    });
  }

  private flash(message: string): void {
    this.toast.setText(message).setVisible(true);
    this.toastTimer?.remove();
    this.toastTimer = this.scene.time.delayedCall(TOAST_MS, () => this.toast.setVisible(false));
  }
}
