import type { SceneLayoutConfig, SceneObjectLayout } from './sceneLayout';

/**
 * Bounds for an editable scene object. Ratios may sit well outside 0..1 — a
 * screen-space object can legitimately start off-panel, and a world-space one
 * in a scrolling level is routinely several design widths along it — but not
 * absurdly so, and a scale of zero would persist an invisible object.
 *
 * The upper scale bound is deliberately generous because `scale` is a
 * multiplier of an object's *native* size, and not every editable object is
 * artwork. Level 4's stall-entry zone is a 1x1 rectangle whose scaleX/scaleY
 * are therefore read directly as its width and height in world pixels, so a
 * perfectly ordinary zone a few hundred pixels wide arrives here as a scale of
 * a few hundred. The old ceiling of 20 rejected every such save with a 400 —
 * and because one POST carries a whole scene's slice, a single unauthorable
 * zone silently took the player and door edits down with it. The ceiling now
 * sits above the widest level (`LEVEL4_WORLD_WIDTH` is ~4.2k px) while still
 * catching the NaN/absurd values it was there to catch.
 */
const MIN_RATIO = -10;
const MAX_RATIO = 10;
const MIN_SCALE = 0.01;
const MAX_SCALE = 10_000;
/** Bounds for the plain absolute `value` field — generous, just catching NaN/absurd saves. */
const MIN_VALUE = -100_000;
const MAX_VALUE = 100_000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateObjectLayout(value: unknown, where: string): SceneObjectLayout {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${where} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const layout: SceneObjectLayout = {};
  for (const key of ['xRatio', 'yRatio'] as const) {
    if (record[key] === undefined) continue;
    if (!isFiniteNumber(record[key])) throw new Error(`${where}.${key} must be a finite number`);
    if (record[key] < MIN_RATIO || record[key] > MAX_RATIO) {
      throw new Error(`${where}.${key} must be between ${MIN_RATIO} and ${MAX_RATIO}`);
    }
    layout[key] = record[key];
  }
  for (const key of ['scale', 'scaleX', 'scaleY'] as const) {
    if (record[key] === undefined) continue;
    if (!isFiniteNumber(record[key])) throw new Error(`${where}.${key} must be a finite number`);
    if (record[key] < MIN_SCALE || record[key] > MAX_SCALE) {
      throw new Error(`${where}.${key} must be between ${MIN_SCALE} and ${MAX_SCALE}`);
    }
    layout[key] = record[key];
  }
  if (record.flipX !== undefined) {
    if (typeof record.flipX !== 'boolean') throw new Error(`${where}.flipX must be a boolean`);
    layout.flipX = record.flipX;
  }
  if (record.value !== undefined) {
    if (!isFiniteNumber(record.value)) throw new Error(`${where}.value must be a finite number`);
    if (record.value < MIN_VALUE || record.value > MAX_VALUE) {
      throw new Error(`${where}.value must be between ${MIN_VALUE} and ${MAX_VALUE}`);
    }
    layout.value = record.value;
  }
  return layout;
}

/** Used by the dev-only save endpoint; one payload carries one scene's slice. */
export function validateSceneLayout(value: unknown): SceneLayoutConfig {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected a scene layout object keyed by scene');
  }
  const out: SceneLayoutConfig = {};
  for (const [sceneKey, objects] of Object.entries(value as Record<string, unknown>)) {
    if (typeof objects !== 'object' || objects === null) {
      throw new Error(`"${sceneKey}" must map object ids to layouts`);
    }
    out[sceneKey] = {};
    for (const [objectId, layout] of Object.entries(objects as Record<string, unknown>)) {
      out[sceneKey][objectId] = validateObjectLayout(layout, `"${sceneKey}.${objectId}"`);
    }
  }
  return out;
}
