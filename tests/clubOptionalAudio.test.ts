import { describe, expect, it, vi } from 'vitest';
import { warmClubOptionalAudio } from '../src/game/level/club/clubOptionalAudio';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe('Club optional audio warm-up', () => {
  it('does not gate Club startup while audio is unresolved', async () => {
    const pending = deferred<void>();
    const load = vi.fn(() => pending.promise);
    const ready = vi.fn();

    // The function returns immediately; ClubScene can continue creating its
    // poster, player and runtime image queue while audio remains pending.
    expect(() => warmClubOptionalAudio({ load }, ready)).not.toThrow();
    expect(load).toHaveBeenCalledOnce();
    expect(ready).not.toHaveBeenCalled();

    pending.resolve();
    await pending.promise;
    await Promise.resolve();
    expect(ready).toHaveBeenCalledOnce();
  });

  it('treats an audio loader failure as non-fatal', async () => {
    const failed = Promise.reject(new Error('decode failed'));
    const ready = vi.fn();
    warmClubOptionalAudio({ load: () => failed }, ready);
    await failed.catch(() => undefined);
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
  });
});
