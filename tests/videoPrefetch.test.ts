import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPrefetchedVideoUrls,
  prefetchVideo,
  releasePrefetchedVideo,
} from '../src/game/systems/videoPrefetch';

interface FakeVideo {
  muted: boolean;
  defaultMuted: boolean;
  preload: string;
  src: string;
  attributes: Record<string, string>;
  loadCalls: number;
  playCalls: number;
  srcRemoved: boolean;
}

let created: FakeVideo[] = [];

beforeEach(() => {
  created = [];
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      expect(tag).toBe('video');
      const element = {
        muted: false,
        defaultMuted: false,
        preload: '',
        src: '',
        attributes: {} as Record<string, string>,
        loadCalls: 0,
        playCalls: 0,
        srcRemoved: false,
        setAttribute(name: string, value: string) {
          element.attributes[name] = value;
        },
        removeAttribute(name: string) {
          if (name === 'src') {
            element.srcRemoved = true;
            element.src = '';
          }
        },
        load() {
          element.loadCalls += 1;
        },
        play() {
          element.playCalls += 1;
        },
      };
      created.push(element as unknown as FakeVideo);
      return element;
    },
  });
});

afterEach(() => {
  for (const url of getPrefetchedVideoUrls()) releasePrefetchedVideo(url);
  vi.unstubAllGlobals();
});

describe('video prefetch', () => {
  it('starts a muted, playsinline, never-played download', () => {
    prefetchVideo('a.mp4');
    expect(created).toHaveLength(1);
    const element = created[0];
    expect(element.src).toBe('a.mp4');
    expect(element.muted).toBe(true);
    expect(element.defaultMuted).toBe(true);
    expect(element.attributes.playsinline).toBe('playsinline');
    expect(element.preload).toBe('auto');
    expect(element.loadCalls).toBe(1);
    // The whole point: it warms the cache and never decodes for playback.
    expect(element.playCalls).toBe(0);
  });

  it('never creates a second element for a url already being prefetched', () => {
    prefetchVideo('a.mp4');
    prefetchVideo('a.mp4');
    prefetchVideo('a.mp4');
    expect(created).toHaveLength(1);
    expect(getPrefetchedVideoUrls()).toEqual(['a.mp4']);
  });

  it('re-prefetches after a release, so a retry warms again', () => {
    prefetchVideo('a.mp4');
    releasePrefetchedVideo('a.mp4');
    expect(getPrefetchedVideoUrls()).toEqual([]);
    prefetchVideo('a.mp4');
    expect(created).toHaveLength(2);
  });

  it('detaches the source on release so the request is torn down', () => {
    prefetchVideo('a.mp4');
    releasePrefetchedVideo('a.mp4');
    const element = created[0];
    expect(element.srcRemoved).toBe(true);
    expect(element.loadCalls).toBe(2);
  });

  it('releasing an unknown or already-released url is a no-op', () => {
    expect(() => releasePrefetchedVideo('nope.mp4')).not.toThrow();
    prefetchVideo('a.mp4');
    releasePrefetchedVideo('a.mp4');
    expect(() => releasePrefetchedVideo('a.mp4')).not.toThrow();
    expect(created).toHaveLength(1);
  });

  it('holds several urls independently', () => {
    prefetchVideo('a.mp4');
    prefetchVideo('b.mp4');
    expect(getPrefetchedVideoUrls()).toEqual(['a.mp4', 'b.mp4']);
    releasePrefetchedVideo('a.mp4');
    expect(getPrefetchedVideoUrls()).toEqual(['b.mp4']);
  });
});
