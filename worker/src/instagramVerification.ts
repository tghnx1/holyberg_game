import type { VerificationStatus } from './leaderboardService';

export const INSTAGRAM_CHECK_TIMEOUT_MS = 2500;

export interface InstagramResponseDetails {
  status: number;
  ok: boolean;
  finalUrl: string;
  html: string;
  redirected?: boolean;
}

export type InstagramFetcher = (url: string, init: RequestInit) => Promise<Response>;
export interface InstagramCheckReport {
  username: string;
  status: VerificationStatus;
  finalUrl: string;
  statusCode: number;
  redirected: boolean;
  bodyLength: number;
  signals: {
    notFound: boolean;
    login: boolean;
    challenge: boolean;
    rateLimited: boolean;
    profile: boolean;
  };
}

export function getInstagramSignals(response: InstagramResponseDetails) {
  const html = response.html.toLowerCase();
  const finalUrl = response.finalUrl.toLowerCase();
  const login = /\/accounts\/login/.test(finalUrl) || html.includes('accounts/login');
  const challenge =
    /\/challenge|\/checkpoint/.test(finalUrl) ||
    html.includes('challenge_required') ||
    html.includes('checkpoint_required');
  const rateLimited =
    response.status === 429 || html.includes('please wait a few minutes before you try again');
  const notFound =
    response.status === 404 ||
    [
      "sorry, this page isn't available",
      'the link you followed may be broken',
      'page not found',
      'user not found',
    ].some((marker) => html.includes(marker));

  return { login, challenge, rateLimited, notFound };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasProfileMarkers(username: string, response: InstagramResponseDetails): boolean {
  const html = response.html;
  const lower = html.toLowerCase();
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
  const titleMarker = new RegExp(`@${escapedUsername}.*instagram photos and videos`, 'i');
  const descriptionMarker = new RegExp(
    `<meta[^>]+property=["']og:description["'][^>]+content=["'][^"']*(followers|following|posts)[^"']*["']`,
    'i',
  );

  return (
    profileMarkers.some((marker) => marker.test(html)) ||
    titleMarker.test(html) ||
    (lower.includes('instagram photos and videos') && lower.includes(`@${escapedUsername}`)) ||
    descriptionMarker.test(html)
  );
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
  const { login, challenge, rateLimited, notFound } = getInstagramSignals(response);
  if (login || challenge || rateLimited) return 'unverified';

  if (response.status === 401 || response.status === 403 || response.status >= 500) {
    return 'unverified';
  }

  if (notFound) return 'invalid';

  return response.ok && hasProfileMarkers(username, response) ? 'verified' : 'unverified';
}

export function inspectInstagramResponse(
  username: string,
  response: InstagramResponseDetails,
): InstagramCheckReport {
  const { login, challenge, rateLimited, notFound } = getInstagramSignals(response);
  const profile = response.ok && hasProfileMarkers(username, response);
  const status = profile ? 'verified' : notFound ? 'invalid' : 'unverified';

  return {
    username,
    status,
    finalUrl: response.finalUrl,
    statusCode: response.status,
    redirected: response.redirected ?? false,
    bodyLength: response.html.length,
    signals: {
      notFound,
      login,
      challenge,
      rateLimited,
      profile,
    },
  };
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
    const report = inspectInstagramResponse(username, {
      status: response.status,
      ok: response.ok,
      finalUrl: response.url,
      html,
      redirected: response.redirected,
    });
    console.debug('[Leaderboard][instagram-check]', {
      username: report.username,
      status: report.status,
      reason: explainInstagramDecision(report),
      finalUrl: report.finalUrl,
      statusCode: report.statusCode,
      redirected: report.redirected,
      bodyLength: report.bodyLength,
      signals: report.signals,
    });
    return report.status;
  } catch {
    return 'unverified';
  } finally {
    clearTimeout(timeout);
  }
}

export function explainInstagramDecision(report: InstagramCheckReport): string {
  if (report.status === 'verified') return 'profile markers found';
  if (report.signals.notFound) return 'explicit not-found signal';
  if (report.signals.login) return 'login redirect';
  if (report.signals.challenge) return 'challenge page';
  if (report.signals.rateLimited) return 'rate limited';
  if (report.statusCode !== 200) return `http ${report.statusCode}`;
  return 'no decisive profile markers';
}
