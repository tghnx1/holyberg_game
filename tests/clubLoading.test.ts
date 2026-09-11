import { describe, expect, it } from 'vitest';
import { ClubRuntimeAssetLoader } from '../src/game/level/club/ClubRuntimeAssetLoader';
import { getClubRoomMinimumAssets } from '../src/game/level/club/clubRoomAssets';
import { getClubRoomSceneryForRoom, CLUB_ROOM_SCENERY_ITEMS } from '../src/game/level/club/clubRoomScenery';
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
  const queued: { key: string; url: string; type: 'image' | 'audio' }[] = [];
  const audio = new Set<string>();
  let loading = false;
  let starts = 0;
  const scene = {
    textures: { exists: (key: string) => loaded.has(key) },
    cache: { audio: { exists: (key: string) => audio.has(key) } },
    events,
    load: {
      isLoading: () => loading,
      image: (key: string, url: string) => queued.push({ key, url, type: 'image' }),
      audio: (key: string, url: string) => queued.push({ key, url, type: 'audio' }),
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
      for (const asset of queued) {
        if (asset.type === 'audio') audio.add(asset.key);
        else loaded.add(asset.key);
      }
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

  it('blocks on current-room furniture, without decoding furniture from other rooms', () => {
    for (const [index, room] of CLUB_ROOMS.entries()) {
      const keys = getClubRoomMinimumAssets(index).images.map((asset) => asset.key);
      for (const item of CLUB_ROOM_SCENERY_ITEMS) {
        expect(keys.includes(item.textureKey)).toBe(item.roomId === room.id);
      }
    }
  });

  it('keeps a cold destination pending until its furniture batch completes', async () => {
    const harness = loaderHarness();
    const runtime = new ClubRuntimeAssetLoader(harness.scene as never);
    const minimum = getClubRoomMinimumAssets(1);
    let ready = false;
    const done = runtime.load(minimum.images).then(() => { ready = true; });
    await flushQueue();
    expect(ready).toBe(false);
    expect(harness.queued.map((asset) => asset.key)).toContain(getClubRoomSceneryForRoom('corridor')[0].textureKey);
    harness.complete();
    await done;
    expect(ready).toBe(true);
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
    expect(harness.queued).toEqual([{ key: 'cold', url: 'cold.webp', type: 'image' }]);
    harness.complete();
    await done;
  });

  it('serializes a deferred audio registration through the same runtime loader', async () => {
    const harness = loaderHarness();
    const runtime = new ClubRuntimeAssetLoader(harness.scene as never);
    const done = runtime.load([{ key: 'club-sting', url: 'club.mp3', type: 'audio' }]);
    await flushQueue();
    expect(harness.queued).toEqual([{ key: 'club-sting', url: 'club.mp3', type: 'audio' }]);
    harness.complete();
    await done;
  });
});
