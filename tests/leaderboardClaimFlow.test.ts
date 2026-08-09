import { describe, expect, it, vi } from 'vitest';
import {
  INSTAGRAM_STORAGE_KEY,
  readStoredInstagram,
  saveStoredInstagram,
  shouldShowClaimUi,
  updateSavedScore,
  type LeaderboardStorage,
} from '../src/game/leaderboard/claimFlow';
import type { ClaimedLeaderboardSnapshot } from '../src/game/leaderboard/domain';

class MemoryStorage implements LeaderboardStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function response(bestScore: number, rank: number): ClaimedLeaderboardSnapshot {
  return {
    instagram: 'holyberg_',
    bestScore,
    rank,
    top10: [{ instagram: 'holyberg_', bestScore }],
    instagramStatus: 'verified',
  };
}

describe('claimed leaderboard replay flow', () => {
  it('persists the Instagram username after the first claim', () => {
    const storage = new MemoryStorage();
    expect(saveStoredInstagram(storage, '@Holyberg_')).toBe(true);
    expect(storage.getItem(INSTAGRAM_STORAGE_KEY)).toBe('holyberg_');
    expect(readStoredInstagram(storage)).toBe('holyberg_');
  });

  it('uses the returned higher best score and updated rank', async () => {
    const submit = vi.fn().mockResolvedValue(response(12_000, 3));
    const update = await updateSavedScore('holyberg_', 12_000, submit);

    expect(submit).toHaveBeenCalledWith('holyberg_', 12_000);
    expect(update).toEqual({ status: 'success', snapshot: response(12_000, 3) });
  });

  it('uses the existing backend best when the replay score is lower', async () => {
    const submit = vi.fn().mockResolvedValue(response(12_000, 3));
    const update = await updateSavedScore('holyberg_', 8_000, submit);

    expect(update).toEqual({ status: 'success', snapshot: response(12_000, 3) });
  });

  it('does not show claim UI when a valid username is stored', () => {
    expect(shouldShowClaimUi('holyberg_')).toBe(false);
    expect(shouldShowClaimUi('')).toBe(true);
  });

  it('keeps the stored username and local score when the network fails', async () => {
    const storage = new MemoryStorage();
    saveStoredInstagram(storage, 'holyberg_');
    const failure = new Error('offline');
    const update = await updateSavedScore('holyberg_', 9_500, async () => {
      throw failure;
    });

    expect(update).toEqual({
      status: 'error',
      instagram: 'holyberg_',
      localScore: 9_500,
      error: failure,
    });
    expect(readStoredInstagram(storage)).toBe('holyberg_');
  });
});
