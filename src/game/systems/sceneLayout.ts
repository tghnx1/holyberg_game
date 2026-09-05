import rawLayout from '../assets/sceneLayout.json';

/**
 * Editable layout for any gameplay scene, keyed by scene key.
 *
 * This is the shared home for values a designer moves in SceneEditor and
 * expects to survive a reload — including the main playable character's own
 * *visual* placement and scale. Nothing here is gameplay: physics bodies,
 * speeds, collision and balance are untouched by every value in this file, and
 * the player entry in particular only ever drives the sprite that is drawn.
 *
 * Stored as ratios rather than absolute pixels, so one saved layout is
 * correct on desktop and on a phone. What each ratio is a fraction *of* is
 * the consumer's decision, and there are exactly two right answers:
 *
 * - a **screen-space composition** — the dialogue's scene/portrait panels —
 *   divides up a live panel, so it resolves against that panel's current
 *   size (`DialogueStageViewport`);
 * - a **world-space position** — anything standing in a level — resolves
 *   against the fixed canonical box in `designSpace.ts`, because a place in
 *   the world does not move when the window does.
 *
 * A scene with no entry falls back to whatever it computes itself, which is
 * what lets a brand-new level participate before anyone has edited it.
 */
export interface SceneObjectLayout {
  /** Fraction of the consumer's reference box: a live panel, or `DESIGN_SPACE`. */
  xRatio?: number;
  yRatio?: number;
  /** Visual scale multiplier applied on top of the object's own natural scale. */
  scale?: number;
  /**
   * Independent axis scales, for artwork that is deliberately stretched on
   * one axis only — Level 4's toilet strip keeps its horizontal proportion
   * against the character while its height fills the frame, so a single
   * uniform `scale` cannot express what the editor is allowed to author for
   * it. An object that scales uniformly keeps using `scale` alone.
   */
  scaleX?: number;
  scaleY?: number;
  /** Authored visual mirror for character sprites; never encoded as negative scale. */
  flipX?: boolean;
  /**
   * A plain absolute number, for an authored value that is not a screen
   * position or a scale multiplier at all — Level 4's `autoWalkSpeed` (a
   * px/s speed) is the first of these. Deliberately not run through the
   * xRatio/yRatio viewport conversion above: a speed saved as a fraction of
   * whatever screen happened to be open would silently change on a
   * different screen, which is exactly what every other field here exists
   * to avoid for on-screen positions.
   */
  value?: number;
}

export type SceneLayoutConfig = Record<string, Record<string, SceneObjectLayout>>;

const stored = rawLayout as SceneLayoutConfig;

/** Live copy, so an editor drag is visible before it is ever saved. */
let current: SceneLayoutConfig = structuredClone(stored);

export function getSceneLayout(sceneKey: string): Record<string, SceneObjectLayout> {
  return current[sceneKey] ?? {};
}

export function getSceneObjectLayout(
  sceneKey: string,
  objectId: string,
): SceneObjectLayout | undefined {
  return current[sceneKey]?.[objectId];
}

export function setSceneObjectLayout(
  sceneKey: string,
  objectId: string,
  layout: SceneObjectLayout,
): void {
  current = {
    ...current,
    [sceneKey]: { ...(current[sceneKey] ?? {}), [objectId]: layout },
  };
}

/** Just this scene's slice, which is all a save is allowed to overwrite. */
/**
 * Forgets one object entirely, rather than storing an emptied entry.
 *
 * Deleting an object in the editor has to be expressible in the saved file:
 * `setSceneObjectLayout` can only add or update, so without this a removed
 * object would keep its authored entry and reappear on the next reload. Only
 * needed by scenes whose editable objects can genuinely be deleted — a scene's
 * player or backdrop is a singleton and has no `remove`.
 */
export function removeSceneObjectLayout(sceneKey: string, objectId: string): void {
  const scene = current[sceneKey];
  if (!scene || !(objectId in scene)) return;
  const rest = { ...scene };
  delete rest[objectId];
  current = { ...current, [sceneKey]: rest };
}

export function buildSceneLayoutPayload(sceneKey: string): SceneLayoutConfig {
  return { [sceneKey]: current[sceneKey] ?? {} };
}

export function resetSceneLayout(source: SceneLayoutConfig = stored): void {
  current = structuredClone(source);
}
