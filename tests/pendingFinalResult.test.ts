import { describe, expect, it } from 'vitest';
import {
  PENDING_RESULT_STORAGE_KEY,
  clearPendingFinalResult,
  parsePendingFinalResult,
  readPendingFinalResult,
  savePendingFinalResult,
  resolvePendingFinalResultRoute,
  type PendingResultStorage,
} from '../src/game/leaderboard/pendingResult';
import type { RhythmResult } from '../src/game/rhythm/types';

class MemoryStorage implements PendingResultStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function finalResult(overrides: Partial<RhythmResult> = {}): RhythmResult {
  return {
    score: 4_200,
    rawScore: 4_400,
    maximumRawScore: 5_000,
    scorePenalty: 200,
    combo: 12,
    maxCombo: 48,
    perfect: 90,
    good: 20,
    ok: 6,
    miss: 3,
    badTap: 1,
    berlinScore: 1_500,
    accuracy: 92.4,
    success: true,
    bossScore: 3_000,
    bossHits: 7,
    bossMaxCombo: 5,
    bossEmeralds: 4,
    bossEmeraldScore: 800,
    ...overrides,
  };
}

describe('pending final result recovery', () => {
  it('round-trips the whole result, boss breakdown included', () => {
    const storage = new MemoryStorage();
    const result = finalResult();

    expect(savePendingFinalResult(storage, result)).toBe(true);
    expect(readPendingFinalResult(storage)).toEqual(result);
  });

  it('restores a result without a boss fight', () => {
    const storage = new MemoryStorage();
    const result = finalResult({
      bossScore: undefined,
      bossHits: undefined,
      bossMaxCombo: undefined,
      bossEmeralds: undefined,
      bossEmeraldScore: undefined,
    });

    savePendingFinalResult(storage, result);
    const restored = readPendingFinalResult(storage);
    expect(restored?.bossScore).toBeUndefined();
    expect(restored?.berlinScore).toBe(1_500);
  });

  it('forgets the result once the run is settled', () => {
    const storage = new MemoryStorage();
    savePendingFinalResult(storage, finalResult());
    clearPendingFinalResult(storage);

    expect(storage.getItem(PENDING_RESULT_STORAGE_KEY)).toBeNull();
    expect(readPendingFinalResult(storage)).toBeUndefined();
  });

  it('ignores missing, malformed, incomplete and foreign payloads', () => {
    expect(parsePendingFinalResult(null)).toBeUndefined();
    expect(parsePendingFinalResult('not json')).toBeUndefined();
    expect(parsePendingFinalResult('{"version":1}')).toBeUndefined();
    expect(
      parsePendingFinalResult(JSON.stringify({ version: 99, result: finalResult() })),
    ).toBeUndefined();
    expect(
      parsePendingFinalResult(
        JSON.stringify({ version: 1, result: { ...finalResult(), berlinScore: undefined } }),
      ),
    ).toBeUndefined();
    expect(
      parsePendingFinalResult(
        JSON.stringify({ version: 1, result: { ...finalResult(), score: 'lots' } }),
      ),
    ).toBeUndefined();
    expect(
      parsePendingFinalResult(
        JSON.stringify({ version: 1, result: { ...finalResult(), bossScore: null } }),
      ),
    ).toBeUndefined();
  });

  it('survives a storage that refuses to write', () => {
    const storage: PendingResultStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };

    expect(savePendingFinalResult(storage, finalResult())).toBe(false);
    expect(readPendingFinalResult(storage)).toBeUndefined();
    expect(() => clearPendingFinalResult(storage)).not.toThrow();
  });

  it('routes a fresh boot back to ResultScene until the run is explicitly settled', () => {
    const storage = new MemoryStorage();
    const result = finalResult();
    savePendingFinalResult(storage, result);
    expect(resolvePendingFinalResultRoute(new URLSearchParams(), storage)).toEqual(result);
    expect(resolvePendingFinalResultRoute(new URLSearchParams('recover=0'), storage)).toBeUndefined();
    clearPendingFinalResult(storage);
    expect(resolvePendingFinalResultRoute(new URLSearchParams(), storage)).toBeUndefined();
  });
});
