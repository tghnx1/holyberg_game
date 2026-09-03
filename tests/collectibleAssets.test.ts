import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMERALD_ANIMATION,
  getCollectibleAnimationAssetUrls,
} from '../src/game/collectibles/collectibleAnimations';

describe('shared collectible art', () => {
  it('lives outside any one level, since Level 1 and the boss both use it', () => {
    const assets = getCollectibleAnimationAssetUrls();
    expect(assets).toHaveLength(9);
    for (const asset of assets) {
      expect(asset.url).toMatch(/^assets\/collectibles\/emerald\/0[1-9]\.png$/);
      expect(existsSync(join(process.cwd(), 'public', asset.url))).toBe(true);
    }
  });

  it('keeps one copy of each frame, shared by texture key', () => {
    const assets = getCollectibleAnimationAssetUrls();
    expect(new Set(assets.map((asset) => asset.url)).size).toBe(assets.length);
    expect(new Set(assets.map((asset) => asset.key)).size).toBe(assets.length);
    expect(assets.map((asset) => asset.key)).toEqual([...EMERALD_ANIMATION.frameKeys]);
  });

  it('no longer leaves the old Level 1 copies behind', () => {
    for (let frame = 1; frame <= 9; frame += 1) {
      expect(existsSync(join(process.cwd(), 'public/assets/level_1', `emerald ${frame}.png`)))
        .toBe(false);
    }
  });

  it('animates all nine frames', () => {
    expect(EMERALD_ANIMATION.frameKeys).toHaveLength(9);
  });
});
