import { describe, expect, it } from 'vitest';
import { ClubRuntimeAssetLoader } from '../src/game/level/club/ClubRuntimeAssetLoader';
import { getClubRoomMinimumAssets } from '../src/game/level/club/clubRoomAssets';
import { CLUB_ROOMS } from '../src/game/level/club/clubRooms';

class FakeEmitter {
  private listeners = new Map<string, (() => void)[]>();

  once(event: string, listener: () => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  emit(event: string): void {
    const listeners = this.listeners.get(event) ?? [];
    this.listeners.delete(event);
    for (const listener of listeners) listener();
  }
}

function loaderHarness() {
  const events = new FakeEmitter();
  const loaderEvents = new FakeEmitter();
  const loaded = new Set<string>();
  const queued: { key: string; url: string }[] = [];
  let loading = false;
  let starts = 0;
  const scene = {
    textures: { exists: (key: string) => loaded.has(key) },
    events,
    load: {
      isLoading: () => loading,
      image: (key: string, url: string) => queued.push({ key, url }),
      once: (event: string, listener: () => void) => loaderEvents.once(event, listener),
      start: () => {
        loading = true;
        starts += 1;
      },
    },
  };
  return {
    scene,
    queued,
    get starts() { return starts; },
    complete() {
      for (const asset of queued) loaded.add(asset.key);
      queued.length = 0;
      loading = false;
      loaderEvents.emit('complete');
    },
  };
}

const flushQueue = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Club cold-load requirements', () => {
  it('uses the requested direct room poster rather than always room 1', () => {
    for (const [index, room] of CLUB_ROOMS.entries()) {
      const minimum = getClubRoomMinimumAssets(index);
      expect(minimum.room.id).toBe(room.id);
      expect(minimum.images[0]).toEqual({ key: room.posterKey, url: room.posterUrl });
      expect(minimum.images.some((asset) => asset.url.endsWith('/01.webp'))).toBe(true);
    }
  });

  it('serializes room-tail and neighbour batches through one Phaser loader', async () => {
    const harness = loaderHarness();
    const runtime = new ClubRuntimeAssetLoader(harness.scene as never);
    const first = runtime.load([{ key: 'current-tail', url: 'current.webp' }]);
    const next = runtime.load([{ key: 'next-room', url: 'next.webp' }]);
    await flushQueue();
    expect(harness.starts).toBe(1);
    expect(harness.queued.map((asset) => asset.key)).toEqual(['current-tail']);

    harness.complete();
    await first;
    await flushQueue();
    expect(harness.starts).toBe(2);
    expect(harness.queued.map((asset) => asset.key)).toEqual(['next-room']);
    harness.complete();
    await next;
  });

  it('skips assets already registered by a completed prefetch/scene load', async () => {
    const harness = loaderHarness();
    harness.scene.textures.exists = (key: string) => key === 'warm';
    const runtime = new ClubRuntimeAssetLoader(harness.scene as never);
    const done = runtime.load([
      { key: 'warm', url: 'warm.webp' },
      { key: 'cold', url: 'cold.webp' },
    ]);
    await flushQueue();
    expect(harness.queued).toEqual([{ key: 'cold', url: 'cold.webp' }]);
    harness.complete();
    await done;
  });
});
