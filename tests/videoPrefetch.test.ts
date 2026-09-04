import { describe, expect, it } from 'vitest';
import {
  AssetPrefetchQueue,
  getPrefetchPolicy,
  type PrefetchAsset,
} from '../src/game/systems/videoPrefetch';

const item = (url: string, priority: PrefetchAsset['priority'] = 'HIGH'): PrefetchAsset => ({
  url,
  priority,
  kind: 'image',
});

describe('campaign asset prefetch queue', () => {
  it('deduplicates a URL and shares its result', async () => {
    let calls = 0;
    const queue = new AssetPrefetchQueue(async () => {
      calls += 1;
      return 123;
    });
    const first = queue.enqueue(item('same.webp'));
    const second = queue.enqueue(item('same.webp'));
    expect(second).toBe(first);
    expect(await second).toMatchObject({ ok: true, bytes: 123 });
    expect(calls).toBe(1);
  });

  it('runs queued critical work before high and low work', async () => {
    const starts: string[] = [];
    let releaseBlocker!: () => void;
    const blocker = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const queue = new AssetPrefetchQueue(async ({ url }) => {
      starts.push(url);
      if (url === 'active') await blocker;
      return 1;
    }, 1);

    const active = queue.enqueue(item('active', 'HIGH'));
    const low = queue.enqueue(item('low', 'LOW'));
    const high = queue.enqueue(item('high', 'HIGH'));
    const critical = queue.enqueue(item('critical', 'CRITICAL'));
    releaseBlocker();
    await Promise.all([active, low, high, critical]);
    expect(starts).toEqual(['active', 'critical', 'high', 'low']);
  });

  it('never exceeds configured concurrency', async () => {
    let active = 0;
    let maximum = 0;
    const queue = new AssetPrefetchQueue(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return 1;
    }, 2);
    const pending = ['a', 'b', 'c', 'd'].map((url) => queue.enqueue(item(url)));
    await Promise.resolve();
    expect(active).toBe(2);
    await Promise.all(pending);
    expect(maximum).toBe(2);
  });

  it('turns failures into a non-blocking result', async () => {
    const queue = new AssetPrefetchQueue(async () => {
      throw new Error('offline');
    });
    await expect(queue.enqueue(item('missing'))).resolves.toMatchObject({
      ok: false,
      bytes: 0,
      error: 'offline',
    });
  });
});

describe('network policy', () => {
  it('limits save-data and very slow connections to critical assets', () => {
    expect(getPrefetchPolicy({ saveData: true, effectiveType: '4g' })).toBe('critical-only');
    expect(getPrefetchPolicy({ effectiveType: 'slow-2g' })).toBe('critical-only');
    expect(getPrefetchPolicy({ effectiveType: '2g' })).toBe('critical-only');
  });

  it('uses the full package on normal or unsupported connections', () => {
    expect(getPrefetchPolicy({ effectiveType: '3g' })).toBe('full');
    expect(getPrefetchPolicy(undefined)).toBe('full');
  });
});
