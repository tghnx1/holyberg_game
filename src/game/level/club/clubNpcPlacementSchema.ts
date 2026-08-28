import { isClubNpcGroupId, type ClubNpcPlacement } from './clubNpcPlacement';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isPlacement(value: unknown): value is ClubNpcPlacement {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    isClubNpcGroupId(record.group) &&
    isFiniteNumber(record.xRatio) &&
    isFiniteNumber(record.heightRatio) &&
    isOptionalFiniteNumber(record.baselineRatio) &&
    isOptionalFiniteNumber(record.cycleMs) &&
    isOptionalFiniteNumber(record.phaseMs) &&
    (record.flipX === undefined || typeof record.flipX === 'boolean')
  );
}

export interface ClubNpcSaveRequest {
  roomId: string;
  placements: ClubNpcPlacement[];
}

/**
 * Used by the dev-only save endpoint. Validates one room's worth of
 * placements; the endpoint merges them into the existing file so saving from
 * the lounge cannot wipe the corridor's crowd.
 */
export function validateClubNpcSaveRequest(value: unknown): ClubNpcSaveRequest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected a club NPC save request object');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.roomId !== 'string' || record.roomId.length === 0) {
    throw new Error('Missing or invalid "roomId"');
  }
  if (!Array.isArray(record.placements)) {
    throw new Error('Missing or invalid "placements" array');
  }
  for (let index = 0; index < record.placements.length; index += 1) {
    if (!isPlacement(record.placements[index])) {
      throw new Error(
        `Invalid placement at index ${index} (expected a known group plus xRatio/heightRatio numbers)`,
      );
    }
  }
  return { roomId: record.roomId, placements: record.placements as ClubNpcPlacement[] };
}
