import { describe, expect, it, vi } from 'vitest';
import {
  classifyInstagramResponse,
  verifyInstagramProfile,
} from '../worker/src/instagramVerification';
import {
  MemoryLeaderboardStore,
  submitLeaderboardScore,
} from '../worker/src/leaderboardService';

const response = (overrides: Partial<Parameters<typeof classifyInstagramResponse>[1]> = {}) => ({
  status: 200,
  ok: true,
  finalUrl: 'https://www.instagram.com/holyberg_/',
  html: '',
  ...overrides,
});

describe('Instagram profile classification', () => {
  it('verifies a clearly valid public profile page', () => {
    expect(
      classifyInstagramResponse(
        'holyberg_',
        response({ html: '<script>{"username":"holyberg_"}</script>' }),
      ),
    ).toBe('verified');
  });

  it.each([
    response({ status: 404, ok: false }),
    response({ html: "Sorry, this page isn't available. The link may be broken." }),
  ])('rejects a clearly nonexistent profile', (instagramResponse) => {
    expect(classifyInstagramResponse('holyberg_', instagramResponse)).toBe('invalid');
  });

  it.each([
    response({ finalUrl: 'https://www.instagram.com/accounts/login/', html: 'Log in' }),
    response({ finalUrl: 'https://www.instagram.com/challenge/', html: 'Challenge required' }),
    response({ status: 429, ok: false, html: 'Please wait' }),
    response({ html: '<html>Changed or ambiguous Instagram markup</html>' }),
  ])('treats login, challenge, rate limiting, and ambiguous HTML as uncertain', (instagramResponse) => {
    expect(classifyInstagramResponse('holyberg_', instagramResponse)).toBe('unverified');
  });

  it('treats a network error as uncertain', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network unavailable');
    });
    await expect(verifyInstagramProfile('holyberg_', fetcher)).resolves.toBe('unverified');
  });

  it('aborts after the timeout and treats it as uncertain', async () => {
    const fetcher = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    await expect(verifyInstagramProfile('holyberg_', fetcher, 5)).resolves.toBe('unverified');
  });
});

describe('Instagram verification submission behavior', () => {
  it('saves uncertain profiles as unverified', async () => {
    const store = new MemoryLeaderboardStore();
    const result = await submitLeaderboardScore(
      store,
      { instagram: '@holyberg_', score: 8_750 },
      async () => 'unverified',
    );
    expect(result.instagramStatus).toBe('unverified');
    expect(await store.getAll()).toEqual([
      { instagram: 'holyberg_', bestScore: 8_750, verificationStatus: 'unverified' },
    ]);
  });

  it('returns verified for a clearly existing profile', async () => {
    const store = new MemoryLeaderboardStore();
    const result = await submitLeaderboardScore(
      store,
      { instagram: 'holyberg_', score: 8_750 },
      async () => 'verified',
    );
    expect(result.instagramStatus).toBe('verified');
  });

  it('rejects a nonexistent profile without saving it', async () => {
    const store = new MemoryLeaderboardStore();
    await expect(
      submitLeaderboardScore(
        store,
        { instagram: 'missing_profile', score: 8_750 },
        async () => 'invalid',
      ),
    ).rejects.toThrow('INSTAGRAM ACCOUNT NOT FOUND');
    expect(await store.getAll()).toHaveLength(0);
  });
});
