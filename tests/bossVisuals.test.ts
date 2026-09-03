import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getBossAssetUrls,
  getBossSpawnFrame,
  resolveBossFacing,
} from '../src/game/boss/bossAssets';

describe('boss visual assets', () => {
  it('uses canonical repository URLs and every declared source exists', () => {
    const assets = getBossAssetUrls();
    expect(assets).toHaveLength(19);
    expect(new Set(assets.map((asset) => asset.key)).size).toBe(assets.length);
    for (const asset of assets) {
      expect(asset.url).toMatch(/^assets\/boss\/[a-z0-9/-]+\.png$/);
      expect(existsSync(join(process.cwd(), 'public', asset.url))).toBe(true);
    }
  });
});

describe('boss orientation', () => {
  const bossX = 640;

  it('looks left, right or front from player position', () => {
    expect(resolveBossFacing(500, bossX, 'front')).toBe('left');
    expect(resolveBossFacing(780, bossX, 'front')).toBe('right');
    expect(resolveBossFacing(640, bossX, 'left')).toBe('front');
  });

  it('uses hysteresis so the pose cannot flicker at a threshold', () => {
    expect(resolveBossFacing(bossX - 73, bossX, 'front')).toBe('left');
    expect(resolveBossFacing(bossX - 60, bossX, 'left')).toBe('left');
    expect(resolveBossFacing(bossX - 53, bossX, 'left')).toBe('front');

    expect(resolveBossFacing(bossX + 73, bossX, 'front')).toBe('right');
    expect(resolveBossFacing(bossX + 60, bossX, 'right')).toBe('right');
    expect(resolveBossFacing(bossX + 53, bossX, 'right')).toBe('front');
  });

  it('alternates left and right frames throughout the rise', () => {
    expect(getBossSpawnFrame(0)).toEqual({ facing: 'left', frameIndex: 0 });
    expect(getBossSpawnFrame(90)).toEqual({ facing: 'right', frameIndex: 1 });
    expect(getBossSpawnFrame(180)).toEqual({ facing: 'left', frameIndex: 2 });
    expect(getBossSpawnFrame(270)).toEqual({ facing: 'right', frameIndex: 3 });
  });
});
