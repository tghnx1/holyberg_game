/**
 * Campaign-wide HTTP-cache warming, generalized from the original detached
 * video prefetcher. Future bytes are downloaded here; Phaser still owns
 * decoding/texture registration when the destination scene actually loads.
 */

export type PrefetchPriority = 'CRITICAL' | 'HIGH' | 'LOW';
export type PrefetchAssetKind = 'video' | 'image' | 'audio' | 'data';

export interface PrefetchAsset {
  url: string;
  priority: PrefetchPriority;
  kind: PrefetchAssetKind;
}

export interface PrefetchResult {
  url: string;
  bytes: number;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface PrefetchSummary {
  files: number;
  bytes: number;
  failed: number;
  results: PrefetchResult[];
}

export interface PrefetchNetworkInfo {
  saveData?: boolean;
  effectiveType?: string;
}

export type PrefetchPolicy = 'critical-only' | 'full';

const PRIORITY_ORDER: Record<PrefetchPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  LOW: 2,
};

export function getPrefetchPolicy(connection?: PrefetchNetworkInfo): PrefetchPolicy {
  if (connection?.saveData) return 'critical-only';
  return connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g'
    ? 'critical-only'
    : 'full';
}

interface QueueEntry {
  asset: PrefetchAsset;
  sequence: number;
  resolve: (result: PrefetchResult) => void;
}

export type AssetWarmer = (asset: PrefetchAsset) => Promise<number>;

/** Stable priority queue with bounded concurrency and URL deduplication. */
export class AssetPrefetchQueue {
  private pending: QueueEntry[] = [];
  private active = 0;
  private sequence = 0;
  private readonly completed = new Map<string, Promise<PrefetchResult>>();

  constructor(
    private readonly warm: AssetWarmer = warmBrowserCache,
    readonly concurrency = 2,
    private readonly now: () => number = () => performance.now(),
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('Prefetch concurrency must be a positive integer');
    }
  }

  enqueue(asset: PrefetchAsset): Promise<PrefetchResult> {
    const existing = this.completed.get(asset.url);
    if (existing) return existing;

    let resolveResult!: (result: PrefetchResult) => void;
    const result = new Promise<PrefetchResult>((resolve) => {
      resolveResult = resolve;
    });
    this.completed.set(asset.url, result);
    this.pending.push({ asset, sequence: this.sequence++, resolve: resolveResult });
    this.pending.sort(
      (a, b) =>
        PRIORITY_ORDER[a.asset.priority] - PRIORITY_ORDER[b.asset.priority] ||
        a.sequence - b.sequence,
    );
    this.pump();
    return result;
  }

  async enqueueAll(assets: readonly PrefetchAsset[]): Promise<PrefetchSummary> {
    const results = await Promise.all(assets.map((asset) => this.enqueue(asset)));
    return {
      files: results.filter((result) => result.ok).length,
      bytes: results.reduce((total, result) => total + result.bytes, 0),
      failed: results.filter((result) => !result.ok).length,
      results,
    };
  }

  has(url: string): boolean {
    return this.completed.has(url);
  }

  urls(): string[] {
    return [...this.completed.keys()];
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const entry = this.pending.shift()!;
      this.active += 1;
      const started = this.now();
      void this.warm(entry.asset)
        .then((bytes) =>
          entry.resolve({
            url: entry.asset.url,
            bytes,
            ok: true,
            durationMs: Math.max(0, this.now() - started),
          }),
        )
        .catch((error: unknown) =>
          entry.resolve({
            url: entry.asset.url,
            bytes: 0,
            ok: false,
            durationMs: Math.max(0, this.now() - started),
            error: error instanceof Error ? error.message : String(error),
          }),
        )
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }
}

/** Reads and discards the stream so bytes reach HTTP cache without a Blob or decoder. */
export async function warmBrowserCache(asset: PrefetchAsset): Promise<number> {
  if (typeof fetch === 'undefined') return 0;
  const response = await fetch(asset.url, { cache: 'force-cache', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  let bytes = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
    }
  } else {
    bytes = (await response.arrayBuffer()).byteLength;
  }
  return bytes;
}

const sharedQueue = new AssetPrefetchQueue();

export function prefetchAsset(asset: PrefetchAsset): Promise<PrefetchResult> {
  return sharedQueue.enqueue(asset);
}

export function prefetchAssets(assets: readonly PrefetchAsset[]): Promise<PrefetchSummary> {
  return sharedQueue.enqueueAll(assets);
}

/** Backward-compatible entry point retained for the existing Club video path. */
export function prefetchVideo(url: string): void {
  void prefetchAsset({ url, priority: 'HIGH', kind: 'video' });
}

/** Fetch-based warming owns no element/decoder, so there is nothing to release. */
export function releasePrefetchedVideo(url: string): void {
  void url;
}

/** Test/debug helper: every deduplicated URL accepted by the shared queue. */
export function getPrefetchedVideoUrls(): string[] {
  return sharedQueue.urls();
}
