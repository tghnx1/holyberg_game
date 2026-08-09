import type {
  ClaimedLeaderboardSnapshot,
  LeaderboardSnapshot,
} from './domain';

// Public Worker endpoint only. Cloudflare credentials and D1 access never ship
// with the GitHub Pages bundle.
export const LEADERBOARD_API_URL = 'https://holyberg-leaderboard.holyberg-game.workers.dev';

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'Leaderboard request failed');
  return payload;
}

export async function fetchLeaderboard(score: number): Promise<LeaderboardSnapshot> {
  const url = new URL(`${LEADERBOARD_API_URL}/leaderboard`);
  url.searchParams.set('score', String(score));
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  return readJson<LeaderboardSnapshot>(response);
}

export async function claimLeaderboardScore(
  instagram: string,
  score: number,
): Promise<ClaimedLeaderboardSnapshot> {
  const response = await fetch(`${LEADERBOARD_API_URL}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ instagram, score }),
  });
  return readJson<ClaimedLeaderboardSnapshot>(response);
}
