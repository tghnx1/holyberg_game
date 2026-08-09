import {
  getTop10,
  isValidInstagramUsername,
  isValidLeaderboardScore,
  normalizeInstagram,
  type ClaimedLeaderboardSnapshot,
  type LeaderboardEntry,
  type LeaderboardSnapshot,
} from '../../src/game/leaderboard/domain';

export type VerificationStatus = 'verified' | 'unverified' | 'invalid';

export interface StoredLeaderboardEntry extends LeaderboardEntry {
  verificationStatus: 'verified' | 'unverified';
}

export interface LeaderboardStore {
  getAll(): Promise<StoredLeaderboardEntry[]>;
  getTop(limit: number): Promise<StoredLeaderboardEntry[]>;
  getRank(score: number): Promise<number>;
  upsertBest(
    instagram: string,
    score: number,
    verificationStatus: 'verified' | 'unverified',
  ): Promise<StoredLeaderboardEntry>;
}

export async function getLeaderboard(
  store: LeaderboardStore,
  score?: number,
): Promise<LeaderboardSnapshot> {
  const top10 = await store.getTop(10);
  return {
    top10: top10.map(({ instagram, bestScore }) => ({ instagram, bestScore })),
    ...(score === undefined ? {} : { rank: await store.getRank(score) }),
  };
}

export async function submitLeaderboardScore(
  store: LeaderboardStore,
  input: { instagram: unknown; score: unknown },
  verify: (username: string) => Promise<VerificationStatus>,
): Promise<ClaimedLeaderboardSnapshot> {
  if (typeof input.instagram !== 'string') throw new Error('Invalid Instagram username');
  const instagram = normalizeInstagram(input.instagram);
  if (!isValidInstagramUsername(instagram)) throw new Error('Invalid Instagram username');
  if (!isValidLeaderboardScore(input.score)) throw new Error('Invalid score');

  const verificationStatus = await verify(instagram);
  const storedVerificationStatus = verificationStatus === 'verified' ? 'verified' : 'unverified';

  const entry = await store.upsertBest(instagram, input.score, storedVerificationStatus);
  const snapshot = await getLeaderboard(store, entry.bestScore);
  return {
    instagram: entry.instagram,
    bestScore: entry.bestScore,
    rank: snapshot.rank ?? 1,
    top10: snapshot.top10,
    instagramStatus: entry.verificationStatus,
  };
}

/** Test store that also formalizes one-row-per-Instagram / best-score semantics. */
export class MemoryLeaderboardStore implements LeaderboardStore {
  private readonly entries = new Map<string, StoredLeaderboardEntry>();

  constructor(seed: readonly LeaderboardEntry[] = []) {
    for (const entry of seed) {
      this.entries.set(entry.instagram, { ...entry, verificationStatus: 'unverified' });
    }
  }

  async getAll(): Promise<StoredLeaderboardEntry[]> {
    return [...this.entries.values()];
  }

  async getTop(limit: number): Promise<StoredLeaderboardEntry[]> {
    return getTop10(await this.getAll()).slice(0, limit) as StoredLeaderboardEntry[];
  }

  async getRank(score: number): Promise<number> {
    return (await this.getAll()).filter((entry) => entry.bestScore > score).length + 1;
  }

  async upsertBest(
    instagram: string,
    score: number,
    verificationStatus: 'verified' | 'unverified',
  ): Promise<StoredLeaderboardEntry> {
    const existing = this.entries.get(instagram);
    const entry: StoredLeaderboardEntry = {
      instagram,
      bestScore: Math.max(existing?.bestScore ?? score, score),
      verificationStatus:
        existing?.verificationStatus === 'verified' || verificationStatus === 'verified'
          ? 'verified'
          : 'unverified',
    };
    this.entries.set(instagram, entry);
    return entry;
  }
}
