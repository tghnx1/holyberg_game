import type { RhythmResult } from '../rhythm/types';
import type { LeaderboardStorage } from './claimFlow';

/**
 * Mobile Safari can drop the page (memory pressure, a background tab reload)
 * while the player is still typing their Instagram handle on ResultScene. The
 * final result is therefore mirrored into localStorage as soon as ResultScene
 * takes it, and BootScene restores that screen instead of starting a fresh
 * run — until the player settles the run by claiming, skipping, or explicitly
 * restarting.
 *
 * This only carries the ResultScene payload; scoring and ranking stay exactly
 * where they were.
 */
export const PENDING_RESULT_STORAGE_KEY = 'holyberg-pending-final-result';

/** Bumped if the stored shape ever changes; older payloads are then ignored. */
const PENDING_RESULT_VERSION = 1;

export interface PendingResultStorage extends LeaderboardStorage {
  removeItem(key: string): void;
}

const REQUIRED_NUMBERS = [
  'score',
  'rawScore',
  'maximumRawScore',
  'scorePenalty',
  'combo',
  'maxCombo',
  'perfect',
  'good',
  'ok',
  'miss',
  'badTap',
  'berlinScore',
  'accuracy',
] as const satisfies readonly (keyof RhythmResult)[];

const OPTIONAL_NUMBERS = [
  'bossScore',
  'bossHits',
  'bossMaxCombo',
  'bossEmeralds',
  'bossEmeraldScore',
] as const satisfies readonly (keyof RhythmResult)[];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Rebuilds a `RhythmResult` from an untrusted stored payload, dropping
 * anything that is not the exact shape ResultScene expects. A partially
 * written or stale entry restores nothing rather than a wrong total.
 */
export function parsePendingFinalResult(raw: string | null): RhythmResult | undefined {
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;

  const record = parsed as Record<string, unknown>;
  if (record.version !== PENDING_RESULT_VERSION) return undefined;
  const stored = record.result;
  if (typeof stored !== 'object' || stored === null) return undefined;

  const source = stored as Record<string, unknown>;
  if (typeof source.success !== 'boolean') return undefined;
  const result: Record<string, unknown> = { success: source.success };
  for (const key of REQUIRED_NUMBERS) {
    if (!isFiniteNumber(source[key])) return undefined;
    result[key] = source[key];
  }
  for (const key of OPTIONAL_NUMBERS) {
    if (source[key] === undefined) continue;
    if (!isFiniteNumber(source[key])) return undefined;
    result[key] = source[key];
  }
  return result as unknown as RhythmResult;
}

export function savePendingFinalResult(
  storage: PendingResultStorage,
  result: RhythmResult,
): boolean {
  try {
    storage.setItem(
      PENDING_RESULT_STORAGE_KEY,
      JSON.stringify({ version: PENDING_RESULT_VERSION, result }),
    );
    return true;
  } catch {
    return false;
  }
}

export function readPendingFinalResult(storage: PendingResultStorage): RhythmResult | undefined {
  try {
    return parsePendingFinalResult(storage.getItem(PENDING_RESULT_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

export function clearPendingFinalResult(storage: PendingResultStorage): void {
  try {
    storage.removeItem(PENDING_RESULT_STORAGE_KEY);
  } catch {
    // A storage that refuses writes simply keeps no recovery state.
  }
}
