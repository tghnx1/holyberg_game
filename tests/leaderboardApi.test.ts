import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { claimLeaderboardScore, fetchLeaderboard } from '../src/game/leaderboard/api';

const nativeFetch = globalThis.fetch;
let server: Server | undefined;

async function serve(stallBody: boolean): Promise<{ received: Promise<void> }> {
  let received: () => void = () => undefined;
  const requestReceived = new Promise<void>((resolve) => { received = resolve; });
  server = createServer((_request, response) => {
    if (stallBody) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"top10":');
    }
    received();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server port');
  vi.stubGlobal('fetch', (_url: string | URL, options: RequestInit) =>
    nativeFetch(`http://127.0.0.1:${address.port}`, options));
  return { received: requestReceived };
}

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
});

describe('leaderboard request deadline', () => {
  it.each([false, true])('releases a claim when response body has started: %s', async (bodyStarted) => {
    // Given a real HTTP server that never finishes its response.
    const { received } = await serve(bodyStarted);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // When the entire request exceeds its deadline.
    const request = claimLeaderboardScore('player', 123);
    const outcome = expect(request).rejects.toThrow(/timed out/i);
    await received;
    await vi.advanceTimersByTimeAsync(15_000);
    // Then the caller receives a retryable error, even with incomplete JSON.
    await outcome;
  });

  it('preserves a successful leaderboard response', async () => {
    // Given a completed API response.
    const snapshot = { top10: [], rank: 1 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(snapshot)));
    // When loading standings.
    const result = await fetchLeaderboard(123);
    // Then the existing payload remains unchanged.
    expect(result).toEqual(snapshot);
  });
});
