import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOSS_ART,
  BOSS_FACING,
  getBossAssetUrls,
  getBossBabyFrames,
  getBossSpawnFrame,
  resolveAttachedBossPoint,
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
  const outside = BOSS_FACING.frontZonePx + BOSS_FACING.hysteresisPx + 1;

  it('turns toward the player once they are clear of the front zone', () => {
    expect(resolveBossFacing(bossX - outside, bossX)).toBe('left');
    expect(resolveBossFacing(bossX + outside, bossX)).toBe('right');
  });

  it('stands straight while the player is anywhere underneath it', () => {
    // The old rule needed playerX === bossX exactly, so the front artwork was
    // effectively unreachable in play.
    expect(resolveBossFacing(bossX, bossX)).toBe('front');
    expect(resolveBossFacing(bossX - 1, bossX)).toBe('front');
    expect(resolveBossFacing(bossX + BOSS_FACING.frontZonePx, bossX)).toBe('front');
  });

  it('keeps a sensible front zone for the boss\u2019s on-screen size', () => {
    expect(BOSS_FACING.frontZonePx).toBeGreaterThanOrEqual(80);
    expect(BOSS_FACING.frontZonePx).toBeLessThanOrEqual(140);
  });

  it('holds its pose across the boundary instead of flickering', () => {
    const { frontZonePx, hysteresisPx } = BOSS_FACING;
    // Just outside the entry zone: a turned boss stays turned, and a straight
    // one stays straight, so there is no x at which both answers are possible.
    const edge = bossX + frontZonePx + hysteresisPx / 2;
    expect(resolveBossFacing(edge, bossX, 'front')).toBe('front');
    expect(resolveBossFacing(edge, bossX, 'right')).toBe('right');
  });

  it('never changes pose twice while the player walks steadily across', () => {
    let facing = resolveBossFacing(bossX - 400, bossX);
    const seen = [facing];
    for (let x = bossX - 400; x <= bossX + 400; x += 2) {
      const next = resolveBossFacing(x, bossX, facing);
      if (next !== facing) seen.push(next);
      facing = next;
    }
    expect(seen).toEqual(['left', 'front', 'right']);
  });

  it('uses the artwork that visually looks the way the boss is facing', () => {
    // The delivered folders are named for the doll's own left and right, which
    // is the mirror of the screen's.
    expect(getBossBabyFrames('left')).toBe(BOSS_ART.baby.right);
    expect(getBossBabyFrames('right')).toBe(BOSS_ART.baby.left);
    expect(getBossBabyFrames('front')).toBe(BOSS_ART.baby.front);
    expect(getBossBabyFrames('front')).toHaveLength(4);
  });

  it('alternates left and right frames throughout the rise', () => {
    expect(getBossSpawnFrame(0)).toEqual({ facing: 'left', frameIndex: 0 });
    expect(getBossSpawnFrame(90)).toEqual({ facing: 'right', frameIndex: 1 });
    expect(getBossSpawnFrame(180)).toEqual({ facing: 'left', frameIndex: 2 });
    expect(getBossSpawnFrame(270)).toEqual({ facing: 'right', frameIndex: 3 });
  });
});

describe('boss-local effect anchors', () => {
  it('moves and scales a child anchor with the boss transform', () => {
    expect(resolveAttachedBossPoint(
      { x: 10, y: 20 },
      { x: 300, y: 100, scaleX: 2, scaleY: 2, rotation: 0 },
    )).toEqual({ x: 320, y: 140 });

    expect(resolveAttachedBossPoint(
      { x: 10, y: 20 },
      { x: 500, y: 250, scaleX: 3, scaleY: 3, rotation: 0 },
    )).toEqual({ x: 530, y: 310 });
  });
});
