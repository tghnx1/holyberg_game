import { describe, expect, it } from 'vitest';
import {
  calculateRank,
  getTop10,
  isValidInstagramUsername,
  normalizeInstagram,
} from '../src/game/leaderboard/domain';
import {
  MemoryLeaderboardStore,
  submitLeaderboardScore,
} from '../worker/src/leaderboardService';

const acceptProfile = async (): Promise<'verified'> => 'verified';

describe('leaderboard ranking', () => {
  const entries = Array.from({ length: 15 }, (_, index) => ({
    instagram: `player_${index + 1}`,
    bestScore: 15_000 - index * 500,
  }));

  it('sorts and returns only the Top 10', () => {
    const top10 = getTop10([...entries].reverse());
    expect(top10).toHaveLength(10);
    expect(top10[0]).toEqual({ instagram: 'player_1', bestScore: 15_000 });
    expect(top10[9]).toEqual({ instagram: 'player_10', bestScore: 10_500 });
  });

  it('calculates a player position outside the Top 10', () => {
    expect(calculateRank(entries, 9_250)).toBe(13);
  });
});

describe('best-score storage', () => {
  it('inserts a first score', async () => {
    const store = new MemoryLeaderboardStore();
    const result = await submitLeaderboardScore(
      store,
      { instagram: '@holyberg_', score: 8_750 },
      acceptProfile,
    );
    expect(result).toMatchObject({ instagram: 'holyberg_', bestScore: 8_750, rank: 1 });
    expect(await store.getAll()).toHaveLength(1);
  });

  it('replaces an existing score when the new score is higher', async () => {
    const store = new MemoryLeaderboardStore([{ instagram: 'holyberg_', bestScore: 8_750 }]);
    const higher = await submitLeaderboardScore(
      store,
      { instagram: 'holyberg_', score: 9_200 },
      acceptProfile,
    );
    expect(higher.bestScore).toBe(9_200);
    expect(await store.getAll()).toHaveLength(1);
  });

  it('keeps the existing best when the new score is lower', async () => {
    const store = new MemoryLeaderboardStore([{ instagram: 'holyberg_', bestScore: 9_200 }]);
    const lower = await submitLeaderboardScore(
      store,
      { instagram: 'holyberg_', score: 7_000 },
      acceptProfile,
    );
    expect(lower.bestScore).toBe(9_200);
    expect(await store.getAll()).toHaveLength(1);
  });
});

describe('Instagram usernames', () => {
  it.each([
    ['holyberg_', 'holyberg_'],
    ['@holyberg_', 'holyberg_'],
    ['instagram.com/holyberg_/', 'holyberg_'],
    ['https://www.instagram.com/Holyberg_/?hl=en', 'holyberg_'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeInstagram(input)).toBe(expected);
  });

  it.each(['', '@', 'name with spaces', 'instagram.com/p/not-a-profile/', 'a'.repeat(31)])(
    'rejects invalid username %s',
    (input) => {
      expect(isValidInstagramUsername(normalizeInstagram(input))).toBe(false);
    },
  );

  it('rejects invalid usernames before persistence', async () => {
    const store = new MemoryLeaderboardStore();
    await expect(
      submitLeaderboardScore(store, { instagram: 'not valid', score: 1_000 }, acceptProfile),
    ).rejects.toThrow('Invalid Instagram username');
    expect(await store.getAll()).toHaveLength(0);
  });
});
