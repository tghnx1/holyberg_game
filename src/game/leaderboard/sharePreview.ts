import type { ClaimedLeaderboardSnapshot } from './domain';
import type { RhythmResult } from '../rhythm/types';

/**
 * The unlinked production query route is deliberately read-only: it only
 * supplies the local snapshot used to render/share a card. The older route
 * remains a DEV convenience and is unavailable from a production build.
 */
export function isSharePreviewEnabled(search: string, isDev: boolean): boolean {
  const query = new URLSearchParams(search);
  return query.get('holyworldSharePreview') === '1'
    || (isDev && query.get('scene') === 'result' && query.get('sharePreview') === '1');
}

export function createSharePreviewSnapshot(): ClaimedLeaderboardSnapshot {
  return {
    instagram: 'preview_player',
    bestScore: 12_450,
    rank: 5,
    instagramStatus: 'unverified',
    top10: [
      { instagram: 'pixelking', bestScore: 22_000 },
      { instagram: 'neon_runner', bestScore: 19_800 },
      { instagram: 'clubber', bestScore: 17_500 },
      { instagram: 'zeta_loop', bestScore: 16_000 },
      { instagram: 'preview_player', bestScore: 12_450 },
      { instagram: 'sidekick', bestScore: 11_900 },
      { instagram: 'nightshift', bestScore: 10_400 },
    ],
  };
}

export function createSharePreviewResult(): RhythmResult {
  return {
    score: 11_250,
    rawScore: 11_250,
    maximumRawScore: 12_000,
    scorePenalty: 0,
    combo: 18,
    maxCombo: 24,
    perfect: 18,
    good: 7,
    ok: 2,
    miss: 1,
    badTap: 0,
    berlinScore: 1_200,
    accuracy: 91.5,
    success: true,
  };
}
