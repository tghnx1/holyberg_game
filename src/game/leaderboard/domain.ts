export const MAX_LEADERBOARD_SCORE = 100_000;

export interface LeaderboardEntry {
  instagram: string;
  bestScore: number;
}

export interface LeaderboardSnapshot {
  top10: LeaderboardEntry[];
  rank?: number;
}

export interface ClaimedLeaderboardSnapshot extends LeaderboardSnapshot {
  instagram: string;
  bestScore: number;
  rank: number;
  instagramStatus: 'verified' | 'unverified';
}

/**
 * Converts a handle or a direct Instagram profile URL to the canonical D1 key.
 * Instagram usernames are case-insensitive, so keys are stored lowercase.
 */
export function normalizeInstagram(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(trimmed)) {
    try {
      const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
      if (!/^(?:www\.)?instagram\.com$/i.test(url.hostname)) return '';
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length !== 1) return '';
      return decodeURIComponent(segments[0]).replace(/^@/, '').toLowerCase();
    } catch {
      return '';
    }
  }

  return trimmed.replace(/^@/, '').replace(/\/$/, '').toLowerCase();
}

export function isValidInstagramUsername(username: string): boolean {
  return /^[a-z0-9._]{1,30}$/.test(username);
}

export function isValidLeaderboardScore(score: unknown): score is number {
  return (
    typeof score === 'number' &&
    Number.isSafeInteger(score) &&
    score >= 0 &&
    score <= MAX_LEADERBOARD_SCORE
  );
}

export function calculateRank(entries: readonly LeaderboardEntry[], score: number): number {
  return entries.filter((entry) => entry.bestScore > score).length + 1;
}

export function getTop10(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries]
    .sort(
      (left, right) =>
        right.bestScore - left.bestScore || left.instagram.localeCompare(right.instagram),
    )
    .slice(0, 10);
}

export function selectBestScore(existingScore: number | undefined, submittedScore: number): number {
  return existingScore === undefined ? submittedScore : Math.max(existingScore, submittedScore);
}
