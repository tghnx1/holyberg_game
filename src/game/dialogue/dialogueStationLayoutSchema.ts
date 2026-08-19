import type { DialogueStationLayoutConfig, StationObjectLayout } from './dialogueStationLayout';

const REQUIRED_KEYS = ['background', 'train', 'foreground', 'atmos', 'disus'] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStationObjectLayout(value: unknown): value is StationObjectLayout {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    isFiniteNumber(record.xRatio) && isFiniteNumber(record.yRatio) && isFiniteNumber(record.heightRatio)
  );
}

/** Used by the dev-only save endpoint; rejects anything that isn't a complete, well-formed layout. */
export function validateDialogueStationLayout(value: unknown): DialogueStationLayoutConfig {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected a dialogue station layout object');
  }
  const record = value as Record<string, unknown>;
  for (const key of REQUIRED_KEYS) {
    if (!isStationObjectLayout(record[key])) {
      throw new Error(`Missing or invalid "${key}" entry (expected xRatio/yRatio/heightRatio numbers)`);
    }
  }
  return {
    background: record.background as StationObjectLayout,
    train: record.train as StationObjectLayout,
    foreground: record.foreground as StationObjectLayout,
    atmos: record.atmos as StationObjectLayout,
    disus: record.disus as StationObjectLayout,
  };
}
