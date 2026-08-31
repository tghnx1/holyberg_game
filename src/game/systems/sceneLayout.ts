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
 * Stored as ratios of the logical viewport rather than absolute pixels, so one
 * saved layout is correct on desktop and on a phone. A scene with no entry
 * falls back to whatever it computes itself, which is what lets a brand-new
 * level participate before anyone has edited it.
 */
export interface SceneObjectLayout {
  /** Fraction of the logical viewport width/height. */
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
export function buildSceneLayoutPayload(sceneKey: string): SceneLayoutConfig {
  return { [sceneKey]: current[sceneKey] ?? {} };
}

export function resetSceneLayout(): void {
  current = structuredClone(stored);
}
