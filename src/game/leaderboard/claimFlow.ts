import type { ClaimedLeaderboardSnapshot } from './domain';
import { isValidInstagramUsername, normalizeInstagram } from './domain';

export const INSTAGRAM_STORAGE_KEY = 'holyberg-leaderboard-instagram';

export interface LeaderboardStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type SavedScoreSubmitter = (
  instagram: string,
  score: number,
) => Promise<ClaimedLeaderboardSnapshot>;

export type SavedScoreUpdate =
  | { status: 'success'; snapshot: ClaimedLeaderboardSnapshot }
  | { status: 'error'; instagram: string; localScore: number; error: unknown };

export function readStoredInstagram(storage: LeaderboardStorage): string {
  try {
    const normalized = normalizeInstagram(storage.getItem(INSTAGRAM_STORAGE_KEY) ?? '');
    return isValidInstagramUsername(normalized) ? normalized : '';
  } catch {
    return '';
  }
}

export function saveStoredInstagram(storage: LeaderboardStorage, instagram: string): boolean {
  const normalized = normalizeInstagram(instagram);
  if (!isValidInstagramUsername(normalized)) return false;

  try {
    storage.setItem(INSTAGRAM_STORAGE_KEY, normalized);
    return true;
  } catch {
    return false;
  }
}

export function shouldShowClaimUi(storedInstagram: string): boolean {
  return !isValidInstagramUsername(normalizeInstagram(storedInstagram));
}

export async function updateSavedScore(
  instagram: string,
  localScore: number,
  submit: SavedScoreSubmitter,
): Promise<SavedScoreUpdate> {
  try {
    return {
      status: 'success',
      snapshot: await submit(instagram, localScore),
    };
  } catch (error) {
    return { status: 'error', instagram, localScore, error };
  }
}
