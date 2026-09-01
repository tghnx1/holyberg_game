import {
  designPointFromLayout,
  layoutRatiosFromDesignPoint,
} from '../../systems/designSpace';
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
 * Positions are world-space: they are resolved against the fixed canonical
 * `DESIGN_SPACE` box, never against the live camera. Level 4 scrolls, so its
 * world is several viewports wide and these coordinates legitimately run
 * past one screen — and, crucially, they mean the same physical place in the
 * room on every device. Resolving them against the live camera width instead
 * (which `Phaser.Scale.EXPAND` grows with the aspect ratio) is what used to
 * slide the NPC, the stall and the whole gap cutscene several hundred pixels
 * right on a landscape phone while the room itself stayed put.
 */

export interface Level4Placement {
  /** World position. For an actor this is its authored floor position. */
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
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
): Level4Placement {
  const layout = getSceneObjectLayout(sceneKey, id);
  if (!layout) return fallback;
  const point = designPointFromLayout(layout, fallback);
  return {
    x: point.x,
    y: point.y,
    scaleX: layout.scaleX ?? layout.scale ?? fallback.scaleX,
    scaleY: layout.scaleY ?? layout.scale ?? fallback.scaleY,
  };
}

/** Records a placement the editor just produced, ready for the next save. */
export function storeLevel4Placement(
  sceneKey: string,
  id: string,
  placement: Level4Placement,
): void {
  const layout: SceneObjectLayout = {
    ...layoutRatiosFromDesignPoint(placement),
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
  /**
   * The toilet-to-Holyworld cinematic: a vertical world-x line where the
   * scripted auto-walk takes over, one where the camera locks, and a
   * rectangular zone where the scripted fall begins. See
   * `resolveLevel4CutsceneConfig`.
   */
  cameraStop: 'gap-cutscene-camera-stop',
  autoWalkTrigger: 'gap-cutscene-auto-walk-trigger',
  autoFallZone: 'gap-cutscene-auto-fall-zone',
  autoWalkSpeed: 'gap-cutscene-auto-walk-speed',
} as const;

/** A world-space rectangle, in the same units as everything else here. */
export interface Level4RectZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The authored configuration for the toilet-to-Holyworld gap cutscene
 * (`Level4Scene`'s `AUTO_WALK`/`FALLING` sequence).
 *
 * `cameraStopFocusX` and `autoWalkTriggerX` are two independent world-x lines
 * — deliberately not one shared coordinate, so the moment control is taken
 * from the player and the moment the camera settles into its final frame can
 * be tuned separately in the editor. Both, plus `autoFallZone`, are resolved
 * through the same per-object world-space store as every other Level 4
 * placement, so P/reload round-trips them exactly like the toilet strip or
 * the door. `autoWalkSpeed` is the one value here that is not a position at
 * all: it is stored as an absolute number (`SceneObjectLayout.value`), so it
 * does not silently change with the screen it happened to be saved at.
 */
export interface Level4CutsceneConfig {
  /**
   * The world x the camera *centres on* once the cinematic locks it — a
   * focus point, not a raw final `scrollX`.
   *
   * A scrollX is the camera's left edge, so storing one made the authored
   * shot mean "start the frame here and show however much of the world this
   * screen happens to fit", which frames a different composition on every
   * aspect ratio: at 16:9 the locked frame ended 1280px later, on a
   * landscape phone ~1560px later, and the gap the shot exists to show sat
   * in a different place in it. A centre is the one point of the frame every
   * aspect ratio agrees on, so the same world detail stays in the middle of
   * the shot and a wider screen simply reveals a little more to either side
   * of it — the same "preserve the composition, reveal more horizontally"
   * policy `Phaser.Scale.EXPAND` already applies to the rest of the game.
   */
  cameraStopFocusX: number;
  autoWalkTriggerX: number;
  autoFallZone: Level4RectZone;
  autoWalkSpeed: number;
}

/** Fallback rectangle used only until an `autoFallZone` has been authored. */
function fallbackFallZonePlacement(zone: Level4RectZone): Level4Placement {
  return { x: zone.x, y: zone.y, scaleX: zone.width, scaleY: zone.height };
}

/**
 * Resolves the whole gap-cutscene config from the shared layout store in one
 * call, the same fallback-until-authored pattern as `resolveLevel4Placement`.
 */
export function resolveLevel4CutsceneConfig(
  sceneKey: string,
  fallback: Level4CutsceneConfig,
): Level4CutsceneConfig {
  const cameraStop = resolveLevel4Placement(
    sceneKey,
    LEVEL4_EDITABLE_IDS.cameraStop,
    { x: fallback.cameraStopFocusX, y: 0, scaleX: 1, scaleY: 1 },
  );
  const autoWalkTrigger = resolveLevel4Placement(
    sceneKey,
    LEVEL4_EDITABLE_IDS.autoWalkTrigger,
    { x: fallback.autoWalkTriggerX, y: 0, scaleX: 1, scaleY: 1 },
  );
  const fallZone = resolveLevel4Placement(
    sceneKey,
    LEVEL4_EDITABLE_IDS.autoFallZone,
    fallbackFallZonePlacement(fallback.autoFallZone),
  );
  return {
    cameraStopFocusX: cameraStop.x,
    autoWalkTriggerX: autoWalkTrigger.x,
    autoFallZone: { x: fallZone.x, y: fallZone.y, width: fallZone.scaleX, height: fallZone.scaleY },
    autoWalkSpeed: resolveLevel4Number(sceneKey, LEVEL4_EDITABLE_IDS.autoWalkSpeed, fallback.autoWalkSpeed),
  };
}

/**
 * An absolute persisted number that is not a screen position or a scale
 * multiplier — `autoWalkSpeed` is a px/s speed, so running it through the
 * same design-space conversion as `Level4Placement`'s x/y would only obscure
 * it; it is neither a place in the world nor a fraction of anything. Reuses
 * `SceneObjectLayout.value`, the same store, schema and save route as
 * everything else here; there is no second config file.
 */
export function resolveLevel4Number(sceneKey: string, id: string, fallback: number): number {
  return getSceneObjectLayout(sceneKey, id)?.value ?? fallback;
}

export function storeLevel4Number(sceneKey: string, id: string, value: number): void {
  setSceneObjectLayout(sceneKey, id, { value });
}

/**
 * The scroll that puts `focusX` in the middle of the frame, clamped to the
 * level's own bounds.
 *
 * This is the level's explicit responsive framing rule, kept pure so the
 * guarantee it exists for — *the same world point is centred at every camera
 * width* — is checkable without a running scene. The camera, not the stored
 * data, is what absorbs a change of aspect ratio: a wider frame reveals more
 * of the world symmetrically either side of the focus point rather than
 * sliding the composition sideways, which is what a stored `scrollX` did.
 *
 * Clamping is the one place a wider camera legitimately shifts the focus off
 * centre, because the level has edges and showing black past them would be
 * worse than an off-centre shot.
 */
export function resolveCameraStopScroll(
  focusX: number,
  cameraWidth: number,
  worldWidth: number,
): number {
  const maxScroll = Math.max(0, worldWidth - cameraWidth);
  return Math.min(Math.max(focusX - cameraWidth / 2, 0), maxScroll);
}
