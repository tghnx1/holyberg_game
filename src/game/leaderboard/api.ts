import type {
  ClaimedLeaderboardSnapshot,
  LeaderboardSnapshot,
} from './domain';

// Public Worker endpoint only. Cloudflare credentials and D1 access never ship
// with the GitHub Pages bundle.
export const LEADERBOARD_API_URL = 'https://holyberg-leaderboard.holyberg-game.workers.dev';

export class LeaderboardTimeoutError extends Error {
  readonly name = 'LeaderboardTimeoutError';

  constructor() {
    super('Leaderboard request timed out. Please retry or skip.');
  }
}

async function requestJson<T>(url: string | URL, options: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'Leaderboard request failed');
    return payload;
  } catch (error) {
    if (controller.signal.aborted) throw new LeaderboardTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchLeaderboard(score: number): Promise<LeaderboardSnapshot> {
  const url = new URL(`${LEADERBOARD_API_URL}/leaderboard`);
  url.searchParams.set('score', String(score));
  return requestJson<LeaderboardSnapshot>(url, { headers: { Accept: 'application/json' } });
}

export async function claimLeaderboardScore(
  instagram: string,
  score: number,
): Promise<ClaimedLeaderboardSnapshot> {
  return requestJson<ClaimedLeaderboardSnapshot>(`${LEADERBOARD_API_URL}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ instagram, score }),
  });
}
