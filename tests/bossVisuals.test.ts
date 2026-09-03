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
    expect(resolveBossFacing(500, bossX)).toBe('left');
    expect(resolveBossFacing(780, bossX)).toBe('right');
    expect(resolveBossFacing(640, bossX)).toBe('front');
  });

  it('always follows the current player side during ordinary combat', () => {
    expect(resolveBossFacing(bossX - 1, bossX)).toBe('left');
    expect(resolveBossFacing(bossX + 1, bossX)).toBe('right');
    expect(resolveBossFacing(bossX, bossX)).toBe('front');
  });

  it('alternates left and right frames throughout the rise', () => {
    expect(getBossSpawnFrame(0)).toEqual({ facing: 'left', frameIndex: 0 });
    expect(getBossSpawnFrame(90)).toEqual({ facing: 'right', frameIndex: 1 });
    expect(getBossSpawnFrame(180)).toEqual({ facing: 'left', frameIndex: 2 });
    expect(getBossSpawnFrame(270)).toEqual({ facing: 'right', frameIndex: 3 });
  });
});
