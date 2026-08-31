import Phaser from 'phaser';
import type { BuiltEntity } from '../level/berlin/LevelBuilder';
import { getBerlinEntityZoneLayout } from '../level/berlin/entityZoneLayout';
import { getPlatformVisualLayout } from '../level/berlin/platformVisualLayout';
import type { BerlinEntity, MovingPlatformConfig } from '../level/berlin/types';
import { SceneEditorCore } from './editor/SceneEditorCore';
import { uniqueEditorId } from './editor/editorClipboard';
import { expandFromVisual, narrowToVisual, type VisualFraction } from './editor/editorGeometry';
import type { EditableItem, EditorMarker, EditorPoint } from './editor/editorItem';
import {
  resizeBoundsSize,
  type MinimumResizeSize,
  type ResizeBounds,
} from './levelEditorResize';

/** Entity kinds the editor lets you move; the `finish` trigger is excluded. */
const EDITABLE_TYPES = new Set(['obstacle', 'collectible', 'platform', 'movingPlatform', 'scenery']);

type EditableConfig = Extract<
  BerlinEntity,
  { type: 'obstacle' | 'collectible' | 'platform' | 'movingPlatform' | 'scenery' }
>;

const MIN_SIZE = 8;
/** How long the on-screen confirmation stays up. */
const TOAST_MS = 1000;
/** Local backup only; the JSON file written by SAVE_ENDPOINT is authoritative. */
const STORAGE_KEY = 'holyberg-background-layout';
/** Handled by the dev-only Vite middleware; absent from production builds. */
const SAVE_ENDPOINT = '/__level-editor/save';

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
const ART_VISUAL_FRACTIONS: Record<string, VisualFraction> = {
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
 * Berlin's adapter onto the shared editor core.
 *
 * Level 1 is the benchmark the shared core was generalised from, so nothing
 * it could do has moved *out* of reach — it has moved *into*
 * `SceneEditorCore`, which now provides selection, drag, resize handles,
 * keyboard nudge and scale, copy/paste, delete, camera pan/zoom, outlines,
 * handles and the on/off lifecycle to every scene alike.
 *
 * What stays here is only what is actually about Berlin: which entity kinds
 * are editable at all, the config/artwork/physics-zone triple that a bounds
 * change has to keep in step, obstacle hitbox scaling, platform `topY` and
 * `editorSized`, moving-platform travel ends, the padded-artwork visual
 * fractions, the localStorage draft, and the save endpoint. Every one of
 * those reaches the core as an `EditableItem` capability rather than as a
 * special case inside it.
 */
export class LevelEditorSystem {
  private readonly entities: EditableEntity[];
  /** Authored positions, kept so a saved layout can report what changed. */
  private readonly authored = new Map<string, { x: number; y: number; movementDistance?: number }>();
  private readonly core: SceneEditorCore;
  private readonly toast: Phaser.GameObjects.Text;
  private toastTimer?: ReturnType<typeof setTimeout>;

  private readonly deleted: string[] = [];
  private restored = false;
  /** Set while a save is in flight so P cannot stack overlapping requests. */
  private saving = false;
  private pasteCount = 0;
  /**
   * The config as it was when the current pointer resize started. Obstacle
   * hitboxes scale relative to it, so it must not drift mid-drag; the core's
   * begin/endEdit hooks scope it to exactly one pointer session.
   */
  private editBaseline?: { entity: EditableEntity; config: EditableConfig };

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
        movementDistance: config.type === 'movingPlatform' ? config.movementDistance : undefined,
      });
    }

    // Screen-fixed confirmation, owned here rather than by the core because
    // saveConfig() can also be driven from the console with edit mode off.
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
      .setDepth(10_003)
      .setVisible(false);

    this.core = new SceneEditorCore(this.scene, {
      title: 'LEVEL EDITOR  —  E exit   P save to berlinLevel.generated.json',
      onSave: () => this.saveConfig(),
      onEnable: () => this.onEditorEnable(),
      onDisable: () => this.onEditorDisable(),
      describe: () => (this.deleted.length ? [`${this.deleted.length} deleted`] : []),
    });
    for (const entity of this.entities) this.core.register(this.itemFor(entity));

    // The generated JSON is the level. A localStorage backup is per-browser,
    // so applying it automatically would make the same build show a different
    // level on a phone than on the desktop that edited it.
    if (this.draftRequested()) this.restoreSavedConfig();
    else this.warnAboutUnappliedDraft();
    this.restored = true;
  }

  get active(): boolean {
    return this.core.active;
  }

  toggle(): void {
    this.core.toggle();
  }

  update(): void {
    this.core.update();
  }

  /** Drops every listener this system registered, for scene shutdown. */
  destroy(): void {
    this.core.destroy();
    if (this.toastTimer !== undefined) clearTimeout(this.toastTimer);
    this.toastTimer = undefined;
    this.toast.destroy();
  }

  private onEditorEnable(): void {
    // Tweens, physics and the scene clock are frozen by the shared core for
    // every scene alike. What is Berlin's own is the snap below: the moving
    // platforms stop mid-flight, so they are put back on their authored
    // centre, and what you drag is the position the config actually stores.
    for (const entity of this.entities) {
      if (entity.config.type !== 'movingPlatform') continue;
      this.shift(entity, entity.config.x - entity.artwork.x, entity.config.y - entity.artwork.y);
    }
    this.hooks.releaseCamera();
  }

  private onEditorDisable(): void {
    this.editBaseline = undefined;
    this.hooks.restoreCamera();
  }

  // ------------------------------------------------------- item adapter

  /**
   * Expresses one Berlin entity in the core's terms. Every optional member
   * below is a capability Berlin genuinely has: its entities can be cloned
   * and deleted, and a moving platform additionally owns two draggable travel
   * markers, which is why the core has generic marker support rather than any
   * knowledge of platforms.
   */
  private itemFor(entity: EditableEntity): EditableItem {
    return {
      id: entity.config.id,
      label: entity.config.id,
      kind: entity.config.type,
      getBounds: () => this.visualBoundsOf(entity),
      setBounds: (bounds) => this.applyVisualBounds(entity, bounds),
      getMinimumSize: () => this.minimumSize(entity.config),
      // Berlin resizes freely and Shift locks the aspect ratio.
      preserveAspect: (shiftDown) => shiftDown,
      beginEdit: () => {
        const before = structuredClone(entity.config);
        this.editBaseline = { entity, config: structuredClone(before) };
        return () => this.restoreConfig(entity, before);
      },
      endEdit: () => {
        this.editBaseline = undefined;
      },
      clone: () => this.cloneEntity(entity),
      remove: () => this.removeEntityById(entity.config.id),
      getMarkers: () => this.markersFor(entity),
      dragMarker: (markerId, point) => this.dragExtreme(entity, markerId as 'start' | 'end', point),
      describe: () => this.describeEntity(entity),
    };
  }

  private markersFor(entity: EditableEntity): EditorMarker[] {
    if (entity.config.type !== 'movingPlatform') return [];
    const { start, end } = this.extremes(entity.config);
    return [
      { id: 'start', point: start, color: COLOR_START },
      { id: 'end', point: end, color: COLOR_END },
    ];
  }

  private describeEntity(entity: EditableEntity): string[] {
    const { config } = entity;
    if (config.type !== 'movingPlatform') return [];
    const { start, end } = this.extremes(config);
    return [
      `axis ${config.axis}   distance ${Math.round(config.movementDistance)}`,
      `start ${Math.round(start.x)},${Math.round(start.y)}   end ${Math.round(end.x)},${Math.round(end.y)}`,
    ];
  }

  /**
   * The single entry point a bounds change takes.
   *
   * A pure translation stays on the `moveBy` path, which is what keeps a
   * drag or an arrow-key nudge from touching an obstacle's hitbox or a
   * platform's stored size at all; only a real size change goes through the
   * resize path, where the hitbox scales against the session baseline.
   */
  private applyVisualBounds(entity: EditableEntity, visual: ResizeBounds): void {
    const current = this.visualBoundsOf(entity);
    const currentSize = resizeBoundsSize(current);
    const nextSize = resizeBoundsSize(visual);
    const resized =
      Math.abs(nextSize.width - currentSize.width) > 0.5 ||
      Math.abs(nextSize.height - currentSize.height) > 0.5;

    if (!resized) {
      // Rounded on the destination rather than on each delta, so a slow drag
      // cannot stall on sub-pixel steps that always round to zero.
      const dx =
        Math.round(entity.config.x + (visual.left - current.left)) - entity.config.x;
      const dy = Math.round(entity.config.y + (visual.top - current.top)) - entity.config.y;
      this.moveBy(entity, dx, dy);
      return;
    }

    const before =
      this.editBaseline?.entity === entity
        ? this.editBaseline.config
        : structuredClone(entity.config);
    this.applyResizeBounds(entity, before, this.fullBoundsFromVisual(entity, visual));
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

  // -------------------------------------------------------------- resizing

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

  /** `entityBounds`, narrowed to the actually-visible art for a padded PNG. */
  private visualBoundsOf(entity: EditableEntity): ResizeBounds {
    return narrowToVisual(this.entityBounds(entity), ART_VISUAL_FRACTIONS[entity.config.artSlot]);
  }

  /**
   * Inverse of `visualBoundsOf`, so a drag on the tight handles still resizes
   * the whole artwork (and `config.width/height`, the real display size)
   * proportionally rather than shrinking the config down to the visible box.
   */
  private fullBoundsFromVisual(entity: EditableEntity, visual: ResizeBounds): ResizeBounds {
    return expandFromVisual(visual, ART_VISUAL_FRACTIONS[entity.config.artSlot]);
  }

  private minimumSize(config: EditableConfig): MinimumResizeSize {
    if (config.type === 'platform' || config.type === 'movingPlatform') {
      return { width: 48, height: MIN_SIZE };
    }
    if (config.type === 'obstacle') return { width: 16, height: 12 };
    return { width: 12, height: 12 };
  }

  private applyResizeBounds(
    entity: EditableEntity,
    before: EditableConfig,
    bounds: ResizeBounds,
  ): void {
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

  /** Restores a config wholesale, for Esc-cancel. */
  private restoreConfig(entity: EditableEntity, before: EditableConfig): void {
    const current = entity.config;
    const restored = structuredClone(before);
    this.shift(entity, restored.x - current.x, restored.y - current.y);
    entity.config = restored;
    this.refreshArtwork(entity);
    this.syncZoneToConfig(entity);
  }

  // ------------------------------------------------------------ copy/paste

  /** Builds a live duplicate and registers it with the core. Returns its id. */
  private cloneEntity(entity: EditableEntity): string | undefined {
    this.pasteCount += 1;
    const taken = new Set(this.entities.map(({ config }) => config.id));
    const config = structuredClone(entity.config);
    config.id = uniqueEditorId(entity.config.id, taken, this.pasteCount);
    const created = this.addEntity(config);
    return created.config.id;
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
    this.core.register(this.itemFor(entity));
    return entity;
  }

  private removeEntityById(id: string): void {
    const entity = this.entities.find(({ config }) => config.id === id);
    if (!entity) return;
    this.deleted.push(id);
    this.removeEntity(entity);
  }

  private removeEntity(entity: EditableEntity): void {
    const index = this.entities.indexOf(entity);
    if (index >= 0) this.entities.splice(index, 1);
    this.authored.delete(entity.config.id);
    if (this.editBaseline?.entity === entity) this.editBaseline = undefined;
    this.core.unregister(entity.config.id);
    this.hooks.despawn(entity.zone);
  }

  // -------------------------------------------------------- moving platform

  /** The two ends of a moving platform's travel, in world coordinates. */
  private extremes(config: MovingPlatformConfig): { start: EditorPoint; end: EditorPoint } {
    const half = config.movementDistance / 2;
    return config.axis === 'horizontal'
      ? { start: { x: config.x - half, y: config.y }, end: { x: config.x + half, y: config.y } }
      : { start: { x: config.x, y: config.y - half }, end: { x: config.x, y: config.y + half } };
  }

  /**
   * Drags one end of the travel while the other stays put, which changes both
   * the centre the config stores and the movement distance.
   */
  private dragExtreme(entity: EditableEntity, which: 'start' | 'end', world: EditorPoint): void {
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
    // Wall-clock: the scene clock is paused while the editor is open, and
    // saveConfig is exactly the thing you press while it is.
    if (this.toastTimer !== undefined) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.setVisible(false), TOAST_MS);
  }
}
