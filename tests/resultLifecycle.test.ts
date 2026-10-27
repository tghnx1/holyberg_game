import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { Scene: class {} } }));
vi.mock('../src/game/leaderboard/api', () => ({
  fetchLeaderboard: vi.fn(),
  claimLeaderboardScore: vi.fn(),
}));

import { fetchLeaderboard, claimLeaderboardScore } from '../src/game/leaderboard/api';
import { ResultScene } from '../src/game/scenes/ResultScene';
import type { RhythmResult } from '../src/game/rhythm/types';
import type { ClaimedLeaderboardSnapshot } from '../src/game/leaderboard/domain';

const result: RhythmResult = {
  berlinScore: 100, score: 200, perfect: 1, good: 0, ok: 0, miss: 0,
  badTap: 0, maxCombo: 1, accuracy: 100, success: true,
  rawScore: 200, maximumRawScore: 200, scorePenalty: 0, combo: 1,
};
const snapshot: ClaimedLeaderboardSnapshot = {
  instagram: 'player', bestScore: 300, rank: 1, top10: [], instagramStatus: 'verified',
};

function label() {
  return { setText: vi.fn().mockReturnThis(), setVisible: vi.fn().mockReturnThis(), setAlpha: vi.fn().mockReturnThis() };
}

function scene() {
  const current = new ResultScene();
  Object.assign(current, {
    scene: { isActive: () => true },
    leaderboardText: label(), leaderboardStatus: label(), playerRowText: label(),
    claimButton: label(), retryAction: label(), skipAction: label(),
    shareButton: label(), restartAction: label(), instagramInput: label(),
  });
  return current;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', { localStorage: { removeItem: vi.fn() } });
  vi.stubGlobal('HTMLInputElement', class {});
  vi.stubGlobal('document', {
    createElement: () => ({ style: {}, remove: vi.fn(), querySelector: () => null }),
    getElementById: () => ({ appendChild: vi.fn() }),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('result scene async lifecycle', () => {
  it('cancels the old modal and opens a fresh one when the scene is initialized again', async () => {
    // Given an open claim prompt from the previous visit.
    const current = scene();
    const previous = current['openClaimModal']();
    // When the scene reenters.
    current.init(result);
    const next = current['openClaimModal']();
    // Then cancellation settles the previous waiter and a new prompt can accept input.
    await expect(previous).resolves.toBeNull();
    expect(next).not.toBe(previous);
    current['removeClaimModal']('player');
    await expect(next).resolves.toBe('player');
  });

  it('ignores a previous visit leaderboard response after reentry', async () => {
    // Given an unresolved request from the previous visit.
    const current = scene();
    let resolve: (value: typeof snapshot) => void = () => undefined;
    vi.mocked(fetchLeaderboard).mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = current['loadLeaderboard']();
    current.init(result);
    // When the old request completes while the new visit is active.
    resolve(snapshot);
    await pending;
    // Then it cannot overwrite the new screen or open a stale prompt.
    expect(current['leaderboardText'].setText).not.toHaveBeenCalled();
    expect(current['modalPromise']).toBeUndefined();
  });

  it('does not clear a new submission flag when an old automatic update completes', async () => {
    // Given an automatic submission belonging to the previous visit.
    const current = scene();
    current['storedInstagram'] = 'player';
    let resolve: (value: typeof snapshot) => void = () => undefined;
    vi.mocked(claimLeaderboardScore).mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = current['updateStoredScore']();
    current.init(result);
    current['submitting'] = true;
    // When the old update completes.
    resolve(snapshot);
    await pending;
    // Then the new submission remains in progress, with its pending score untouched.
    expect(current['submitting']).toBe(true);
    expect(current['claimed']).toBeUndefined();
    expect(window.localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('submits only once when a claim prompt is requested twice', async () => {
    // Given two callers opening the same visible prompt.
    const current = scene();
    vi.mocked(claimLeaderboardScore).mockRejectedValue(new Error('offline'));
    const first = current['promptForClaimAndSubmit']();
    const second = current['promptForClaimAndSubmit']();
    // When the user submits it once.
    current['removeClaimModal']('player');
    await Promise.all([first, second]);
    // Then only one network submission occurs and the claim can be retried.
    expect(claimLeaderboardScore).toHaveBeenCalledTimes(1);
    expect(current['submitting']).toBe(false);
  });

  it('keeps a skipped result settled when an earlier leaderboard load finishes', async () => {
    // Given a leaderboard request still pending when the player chooses Skip.
    const current = scene();
    let resolve: (value: typeof snapshot) => void = () => undefined;
    vi.mocked(fetchLeaderboard).mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = current['loadLeaderboard']();
    current['skipClaim']();
    // When the earlier response arrives.
    resolve(snapshot);
    await pending;
    // Then no prompt reopens and replay remains available.
    expect(current['modalPromise']).toBeUndefined();
    expect(current['leaderboardStatus'].setText).toHaveBeenLastCalledWith('SCORE NOT CLAIMED');
    expect(current['restartAction'].setVisible).toHaveBeenLastCalledWith(true);
    expect(current['retryAction'].setVisible).toHaveBeenLastCalledWith(false);
  });

  it('restores Retry and Skip after a stored-score timeout without losing recovery', async () => {
    // Given an automatic submission that exceeds the API deadline.
    const current = scene();
    current['storedInstagram'] = 'player';
    vi.mocked(claimLeaderboardScore).mockRejectedValue(new Error('request timed out'));
    // When the failed update completes.
    await current['updateStoredScore']();
    // Then Retry and Skip are usable and recovery remains saved.
    expect(current['submitting']).toBe(false);
    expect(current['retryAction'].setVisible).toHaveBeenLastCalledWith(true);
    expect(current['skipAction'].setVisible).toHaveBeenLastCalledWith(true);
    expect(window.localStorage.removeItem).not.toHaveBeenCalled();
  });
});
