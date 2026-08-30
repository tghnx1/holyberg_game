import type { SceneLayoutConfig, SceneObjectLayout } from './sceneLayout';

/**
 * Bounds for an editable scene object. Ratios may sit slightly outside the
 * viewport (an object can legitimately start off-screen), but not absurdly so,
 * and a scale of zero would persist an invisible object.
 */
const MIN_RATIO = -10;
const MAX_RATIO = 10;
const MIN_SCALE = 0.01;
const MAX_SCALE = 20;

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
