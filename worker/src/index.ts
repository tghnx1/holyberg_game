import type { LeaderboardEntry } from '../../src/game/leaderboard/domain';
import {
  getLeaderboard,
  submitLeaderboardScore,
  type LeaderboardStore,
  type StoredLeaderboardEntry,
  type VerificationStatus,
} from './leaderboardService';

interface D1Result<T> {
  results?: T[];
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  DB: D1Database;
}

interface DatabaseRow {
  instagram: string;
  best_score: number;
  verification_status: 'verified' | 'unverified';
}

const PRODUCTION_ORIGIN = 'https://tghnx1.github.io';
const DEVELOPMENT_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

class D1LeaderboardStore implements LeaderboardStore {
  constructor(private readonly database: D1Database) {}

  private map(row: DatabaseRow): StoredLeaderboardEntry {
    return {
      instagram: row.instagram,
      bestScore: row.best_score,
      verificationStatus: row.verification_status,
    };
  }

  async getAll(): Promise<StoredLeaderboardEntry[]> {
    const result = await this.database
      .prepare(
        'SELECT instagram, best_score, verification_status FROM leaderboard ORDER BY best_score DESC, instagram ASC',
      )
      .all<DatabaseRow>();
    return (result.results ?? []).map((row) => this.map(row));
  }

  async getTop(limit: number): Promise<StoredLeaderboardEntry[]> {
    const result = await this.database
      .prepare(
        'SELECT instagram, best_score, verification_status FROM leaderboard ORDER BY best_score DESC, instagram ASC LIMIT ?',
      )
      .bind(limit)
      .all<DatabaseRow>();
    return (result.results ?? []).map((row) => this.map(row));
  }

  async getRank(score: number): Promise<number> {
    const row = await this.database
      .prepare('SELECT COUNT(*) + 1 AS rank FROM leaderboard WHERE best_score > ?')
      .bind(score)
      .first<{ rank: number }>();
    return row?.rank ?? 1;
  }

  async upsertBest(
    instagram: string,
    score: number,
    verificationStatus: 'verified' | 'unverified',
  ): Promise<StoredLeaderboardEntry> {
    const timestamp = new Date().toISOString();
    await this.database
      .prepare(
        `INSERT INTO leaderboard
          (instagram, best_score, created_at, updated_at, verification_status)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(instagram) DO UPDATE SET
          best_score = MAX(leaderboard.best_score, excluded.best_score),
          updated_at = CASE
            WHEN excluded.best_score > leaderboard.best_score THEN excluded.updated_at
            ELSE leaderboard.updated_at
          END,
          verification_status = CASE
            WHEN excluded.verification_status = 'verified' THEN 'verified'
            ELSE leaderboard.verification_status
          END`,
      )
      .bind(instagram, score, timestamp, timestamp, verificationStatus)
      .run();

    const row = await this.database
      .prepare(
        'SELECT instagram, best_score, verification_status FROM leaderboard WHERE instagram = ?',
      )
      .bind(instagram)
      .first<DatabaseRow>();
    if (!row) throw new Error('Leaderboard entry was not saved');
    return this.map(row);
  }
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin');
  const allowed =
    origin === PRODUCTION_ORIGIN || (origin !== null && DEVELOPMENT_ORIGIN.test(origin));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : PRODUCTION_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

async function verifyInstagramProfile(username: string): Promise<VerificationStatus> {
  try {
    const response = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (compatible; HolybergLeaderboard/1.0; +https://tghnx1.github.io/holyberg_game/)',
      },
    });

    if (response.status === 404) return 'invalid';
    if (response.status === 429 || response.status >= 500) return 'unverified';
    const body = await response.text();
    const unavailable = [
      "sorry, this page isn't available",
      'page not found',
      'the link you followed may be broken',
    ].some((marker) => body.toLowerCase().includes(marker));
    if (unavailable) return 'invalid';

    const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const profileMarker = new RegExp(
      `(?:instagram: @${escapedUsername}|"username"\\s*:\\s*"${escapedUsername}")`,
      'i',
    );
    return response.ok && profileMarker.test(body) ? 'verified' : 'unverified';
  } catch {
    // Instagram commonly challenges server-side requests. Ambiguity must not
    // reject a potentially real player.
    return 'unverified';
  }
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const store = new D1LeaderboardStore(env.DB);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });

  if (request.method === 'GET' && url.pathname === '/leaderboard') {
    const rawScore = url.searchParams.get('score');
    const score = rawScore === null ? undefined : Number(rawScore);
    if (score !== undefined && (!Number.isSafeInteger(score) || score < 0 || score > 100_000)) {
      return json(request, { error: 'Invalid score' }, 400);
    }
    return json(request, await getLeaderboard(store, score));
  }

  if (request.method === 'POST' && url.pathname === '/score') {
    let body: { instagram?: unknown; score?: unknown };
    try {
      body = (await request.json()) as { instagram?: unknown; score?: unknown };
    } catch {
      return json(request, { error: 'Invalid JSON body' }, 400);
    }
    try {
      return json(
        request,
        await submitLeaderboardScore(
          store,
          { instagram: body.instagram, score: body.score },
          verifyInstagramProfile,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      return json(request, { error: message }, message.includes('not found') ? 404 : 400);
    }
  }

  return json(request, { error: 'Not found' }, 404);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env).catch((error: unknown) => {
      console.error('Leaderboard request failed', error);
      return json(request, { error: 'Leaderboard unavailable' }, 500);
    });
  },
};

export type { LeaderboardEntry };
