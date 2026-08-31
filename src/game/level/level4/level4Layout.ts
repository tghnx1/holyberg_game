import {
  getSceneObjectLayout,
  setSceneObjectLayout,
  type SceneObjectLayout,
} from '../../systems/sceneLayout';

/**
 * Authored placement for Level 4's scenery and its story NPC.
 *
 * The point of this module is that the editor and the runtime read and write
 * the *same* values. Level 4 rebuilds its toilet strip, stall door and actors
 * from constants on every `create()`, and re-renders its actors from
 * `actor.x/y` on every frame — so an editor that only moved the Phaser
 * display objects was overwritten on the next `syncActor()` and lost entirely
 * on the next scene entry. Everything editable therefore resolves through
 * here, with the hardcoded composition as the fallback used until someone
 * actually authors something.
 *
 * Persistence is the shared scene-layout store (`assets/sceneLayout.json`),
 * keyed by scene, so P saves through the same validated
 * `/__scene-editor/save-layout` route every other scene already uses. There
 * is no second editor config for this level.
 *
 * Positions are stored as ratios of the logical viewport so one authored
 * layout is correct on desktop and phone; Level 4's world is wider than one
 * viewport, so these ratios legitimately exceed 1.
 */

export interface Level4Placement {
  /** World position. For an actor this is its authored floor position. */
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

export interface Level4Viewport {
  width: number;
  height: number;
}

/**
 * The authored placement for `id`, or `fallback` where nothing is authored.
 *
 * Each field falls back independently, so an entry that only pins a scale
 * still gets the composed default position, and an older saved entry that
 * predates `scaleX`/`scaleY` still resolves through `scale`.
 */
export function resolveLevel4Placement(
  sceneKey: string,
  id: string,
  fallback: Level4Placement,
  viewport: Level4Viewport,
): Level4Placement {
  const layout = getSceneObjectLayout(sceneKey, id);
  if (!layout) return fallback;
  return {
    x: layout.xRatio === undefined ? fallback.x : layout.xRatio * viewport.width,
    y: layout.yRatio === undefined ? fallback.y : layout.yRatio * viewport.height,
    scaleX: layout.scaleX ?? layout.scale ?? fallback.scaleX,
    scaleY: layout.scaleY ?? layout.scale ?? fallback.scaleY,
  };
}

/** Records a placement the editor just produced, ready for the next save. */
export function storeLevel4Placement(
  sceneKey: string,
  id: string,
  placement: Level4Placement,
  viewport: Level4Viewport,
): void {
  const layout: SceneObjectLayout = {
    xRatio: viewport.width > 0 ? placement.x / viewport.width : 0,
    yRatio: viewport.height > 0 ? placement.y / viewport.height : 0,
    scaleX: placement.scaleX,
    scaleY: placement.scaleY,
  };
  setSceneObjectLayout(sceneKey, id, layout);
}

/** True once someone has authored this object, so defaults no longer apply. */
export function hasAuthoredLevel4Placement(sceneKey: string, id: string): boolean {
  return getSceneObjectLayout(sceneKey, id) !== undefined;
}

/**
 * Horizontal fraction of the stall-entry target zone each character walks
 * to. Stable fractions rather than world coordinates, so both destinations
 * stay inside the authored zone however it is moved or resized, and read as
 * two people rather than one wherever the zone ends up.
 */
export const STALL_ENTRY_PLAYER_FRACTION = 0.32;
export const STALL_ENTRY_NPC_FRACTION = 0.68;

export interface StallEntryZone {
  /** Centre x/y and pixel width of the authored target rectangle. */
  x: number;
  y: number;
  width: number;
}

export interface StallEntryTargets {
  playerX: number;
  npcX: number;
}

/**
 * Where PLAYER TARGET and NPC TARGET sit inside the authored zone.
 *
 * Pure so the "both destinations stay inside the zone, whatever its size or
 * position" guarantee is checkable without a running scene: both fractions
 * are in (0, 1), so the result is always strictly between the zone's left
 * and right edges.
 */
export function resolveStallEntryTargets(zone: StallEntryZone): StallEntryTargets {
  const left = zone.x - zone.width / 2;
  return {
    playerX: left + zone.width * STALL_ENTRY_PLAYER_FRACTION,
    npcX: left + zone.width * STALL_ENTRY_NPC_FRACTION,
  };
}

/**
 * `resolveStallEntryTargets`'s result is where the *rendered* character
 * should end up — that is what the editor marker shows and what a designer
 * dragging it means. The story NPC's logical `actor.x` and its rendered
 * position are the same number (it carries no presentation offset in this
 * scene), but the main player is drawn at `actor.x + playerOffsetX`, an
 * editor-authored presentation offset that is never zero once a designer has
 * nudged PLAYER in the visual editor. Walking `actor.x` to the raw marker
 * position then leaves the rendered sprite sitting `playerOffsetX` away from
 * where it visibly needed to stop — correct arithmetic reaching the wrong
 * screen position.
 *
 * This converts the visual target into the *logical* one the walk-in actually
 * has to drive `actor.x` to, so that `actor.x + playerOffsetX` — the same sum
 * `syncActor` renders with — lands exactly on the marker. The caller passes 0
 * for `playerOffsetX` when moving anyone but the currently selected player
 * (Level4Scene's own `playerVisualOffset` already returns 0 for the NPC), so
 * this works unchanged for whichever character is selected and whatever
 * offset — or none — has been authored for them; nothing here names a
 * character.
 */
export function resolveStallEntryLogicalTargets(
  zone: StallEntryZone,
  playerOffsetX: number,
): StallEntryTargets {
  const visual = resolveStallEntryTargets(zone);
  return {
    playerX: visual.playerX - playerOffsetX,
    npcX: visual.npcX,
  };
}

export const LEVEL4_EDITABLE_IDS = {
  toilet: 'toilet',
  stallDoor: 'stall-door',
  npc: 'npc',
  /**
   * The stall-entry target zone. Resolved through the same
   * `Level4Placement` shape as everything else here, but for a plain
   * rectangle rather than artwork: its "native size" is 1x1, so `scaleX`/
   * `scaleY` are read directly as the zone's width/height in world pixels
   * rather than as multipliers of some inherent size.
   */
  stallEntryTarget: 'stall-entry-target',
} as const;
