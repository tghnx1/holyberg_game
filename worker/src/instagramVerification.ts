import type { VerificationStatus } from './leaderboardService';

export const INSTAGRAM_CHECK_TIMEOUT_MS = 2500;

export interface InstagramResponseDetails {
  status: number;
  ok: boolean;
  finalUrl: string;
  html: string;
}

export type InstagramFetcher = (url: string, init: RequestInit) => Promise<Response>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Conservative by design: only explicit profile evidence verifies an account,
 * and only explicit Instagram unavailability rejects it. Everything that may
 * be a login wall, challenge, rate limit, or changed markup stays unverified.
 */
export function classifyInstagramResponse(
  username: string,
  response: InstagramResponseDetails,
): VerificationStatus {
  const html = response.html.toLowerCase();
  const finalUrl = response.finalUrl.toLowerCase();
  const uncertainPage =
    /\/accounts\/login|\/challenge|\/checkpoint/.test(finalUrl) ||
    [
      'accounts/login',
      'login • instagram',
      'challenge_required',
      'checkpoint_required',
      'please wait a few minutes before you try again',
    ].some((marker) => html.includes(marker));
  if (uncertainPage) return 'unverified';

  if (
    response.status === 429 ||
    response.status === 401 ||
    response.status === 403 ||
    response.status >= 500
  ) {
    return 'unverified';
  }

  const unavailable =
    response.status === 404 ||
    [
      "sorry, this page isn't available",
      'the link you followed may be broken',
      'page not found',
      'user not found',
    ].some((marker) => html.includes(marker));
  if (unavailable) return 'invalid';

  const escapedUsername = escapeRegExp(username);
  const profileMarkers = [
    new RegExp(`"username"\\s*:\\s*"${escapedUsername}"`, 'i'),
    new RegExp(
      `<meta[^>]+property=["']og:url["'][^>]+content=["']https://www\\.instagram\\.com/${escapedUsername}/["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']https://www\\.instagram\\.com/${escapedUsername}/["'][^>]+property=["']og:url["']`,
      'i',
    ),
    new RegExp(`@${escapedUsername}\\)?\\s*[•|]\\s*instagram`, 'i'),
  ];
  return response.ok && profileMarkers.some((marker) => marker.test(response.html))
    ? 'verified'
    : 'unverified';
}

export async function verifyInstagramProfile(
  username: string,
  fetcher: InstagramFetcher = fetch,
  timeoutMs = INSTAGRAM_CHECK_TIMEOUT_MS,
): Promise<VerificationStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(
      `https://www.instagram.com/${encodeURIComponent(username)}/`,
      {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent':
            'Mozilla/5.0 (compatible; HolybergLeaderboard/1.0; +https://tghnx1.github.io/holyberg_game/)',
        },
      },
    );
    const html = await response.text();
    return classifyInstagramResponse(username, {
      status: response.status,
      ok: response.ok,
      finalUrl: response.url,
      html,
    });
  } catch {
    return 'unverified';
  } finally {
    clearTimeout(timeout);
  }
}
