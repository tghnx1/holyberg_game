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

export const LEVEL4_EDITABLE_IDS = {
  toilet: 'toilet',
  stallDoor: 'stall-door',
  npc: 'npc',
} as const;
