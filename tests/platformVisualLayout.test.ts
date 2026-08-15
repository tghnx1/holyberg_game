import { describe, expect, it } from 'vitest';
import level from '../src/game/level/berlin/berlinLevel.generated.json';
import {
  getPlatformSupportLayout,
  getPlatformTextureAssets,
  getPlatformVisualLayout,
} from '../src/game/level/berlin/platformVisualLayout';
import { getBerlinEntityZoneLayout } from '../src/game/level/berlin/entityZoneLayout';
import type {
  BerlinEntity,
  MovingPlatformConfig,
  PlatformConfig,
} from '../src/game/level/berlin/types';
import { RUN_SPEED } from '../src/game/constants';

const platforms = (level as BerlinEntity[]).filter(
  (entity): entity is PlatformConfig | MovingPlatformConfig =>
    entity.type === 'platform' || entity.type === 'movingPlatform',
);

describe('Berlin platform visual layout', () => {
  it('loads all six project-relative PNG assets', () => {
    expect(getPlatformTextureAssets()).toEqual([
      { key: 'platform-1', url: 'assets/images/platform_1.png' },
      { key: 'platform-2', url: 'assets/images/platform_2.png' },
      { key: 'platform-3', url: 'assets/images/platform_3.png' },
      { key: 'platform-4', url: 'assets/images/platform_4.png' },
      { key: 'platform-5', url: 'assets/images/platform_5.png' },
      { key: 'platform-6', url: 'assets/images/platform_6.png' },
    ]);
  });

  it('assigns a PNG visual to every existing static and moving platform', () => {
    expect(platforms).toHaveLength(12);
    expect(platforms.every((platform) => getPlatformVisualLayout(platform) !== undefined)).toBe(
      true,
    );
  });

  it('uses every platform asset without immediate repetition', () => {
    const keys = platforms.map((platform) => getPlatformVisualLayout(platform)!.textureKey);

    expect(new Set(keys)).toEqual(
      new Set(['platform-1', 'platform-2', 'platform-3', 'platform-4', 'platform-5', 'platform-6']),
    );
    expect(keys.every((key, index) => index === 0 || key !== keys[index - 1])).toBe(true);
  });

  it('covers each collider width with a uniformly scaled deck', () => {
    for (const platform of platforms) {
      const layout = getPlatformVisualLayout(platform)!;
      expect(layout.scale).toBeGreaterThan(0);
      expect(layout.visibleDeckWidth).toBeCloseTo(platform.width, 8);
    }
  });

  it('keeps platforms compact with shallow visible decks', () => {
    expect(platforms.every((platform) => platform.width >= 250 && platform.width <= 400)).toBe(true);
    for (const platform of platforms) {
      const layout = getPlatformVisualLayout(platform)!;
      expect(layout.visibleDeckThickness).toBeGreaterThanOrEqual(34);
      expect(layout.visibleDeckThickness).toBeLessThanOrEqual(62);
    }
  });

  it('aligns every measured PNG surface with the physics platform top', () => {
    for (const platform of platforms) {
      const layout = getPlatformVisualLayout(platform)!;
      const zone = getBerlinEntityZoneLayout(platform);
      expect(layout.visibleSurfaceY).toBeCloseTo(platform.topY, 8);
      expect(zone.width).toBe(platform.width);
      expect(zone.y - zone.height / 2).toBe(platform.topY);
    }
  });

  it('keeps legacy platform art uniform but honours explicit editor height', () => {
    const legacy = platforms[0];
    const legacyLayout = getPlatformVisualLayout(legacy)!;
    expect(legacyLayout.scaleY).toBe(legacyLayout.scaleX);

    const resized: PlatformConfig | MovingPlatformConfig = {
      ...legacy,
      y: legacy.topY + 21,
      height: 42,
      editorSized: true,
    };
    const resizedLayout = getPlatformVisualLayout(resized)!;
    const resizedZone = getBerlinEntityZoneLayout(resized);
    expect(resizedLayout.visibleDeckWidth).toBeCloseTo(resized.width, 8);
    expect(resizedLayout.visibleDeckThickness).toBeCloseTo(42, 8);
    expect(resizedLayout.visibleSurfaceY).toBeCloseTo(resized.topY, 8);
    expect(resizedZone.y - resizedZone.height / 2).toBe(resized.topY);
  });

  it('uses playable 120–200 px nominal gaps inside each elevated route cluster', () => {
    const ids = [
      ['early-moving-platform-1', 'early-moving-platform-2'],
      ['platform-2', 'platform-3'],
      ['platform-4', 'platform-5', 'platform-6', 'final-moving-platform-1'],
      [
        'final-moving-platform-1',
        'final-moving-platform-2',
        'final-moving-platform-3',
        'final-moving-platform-5',
      ],
    ];
    const byId = new Map(platforms.map((platform) => [platform.id, platform]));

    for (const cluster of ids) {
      for (let index = 1; index < cluster.length; index += 1) {
        const previous = byId.get(cluster[index - 1])!;
        const current = byId.get(cluster[index])!;
        const gap = current.x - current.width / 2 - (previous.x + previous.width / 2);
        expect(gap).toBeGreaterThanOrEqual(120);
        expect(gap).toBeLessThanOrEqual(200);
      }
    }
  });

  it('keeps even moving-platform extremes inside the existing double-jump reach', () => {
    const route = [
      'platform-4',
      'platform-5',
      'platform-6',
      'final-moving-platform-1',
      'final-moving-platform-2',
      'final-moving-platform-3',
      'final-moving-platform-5',
    ].map((id) => platforms.find((platform) => platform.id === id)!);
    // The current two-impulse arc stays airborne longer than this conservative
    // 1.3 s budget. The test intentionally uses the unchanged RUN_SPEED.
    const conservativeDoubleJumpReach = RUN_SPEED * 1.3;

    for (let index = 1; index < route.length; index += 1) {
      const previous = route[index - 1];
      const current = route[index];
      const previousTravel =
        previous.type === 'movingPlatform' && previous.axis === 'horizontal'
          ? previous.movementDistance / 2
          : 0;
      const currentTravel =
        current.type === 'movingPlatform' && current.axis === 'horizontal'
          ? current.movementDistance / 2
          : 0;
      const widestPossibleGap =
        current.x + currentTravel - current.width / 2 -
        (previous.x - previousTravel + previous.width / 2);

      expect(widestPossibleGap).toBeLessThanOrEqual(conservativeDoubleJumpReach);
      expect(previous.topY - current.topY).toBeLessThanOrEqual(160);
    }
  });

  it('adds street-connected frames to static platforms and compact frames to moving ones', () => {
    for (const platform of platforms) {
      const supports = getPlatformSupportLayout(platform);
      expect(supports.length).toBeGreaterThanOrEqual(6);
      const bottom = Math.max(...supports.map((piece) => piece.y + piece.height / 2));
      if (platform.type === 'platform') {
        expect(bottom).toBeCloseTo(610 - platform.y, 8);
      } else {
        expect(bottom).toBeLessThan(610 - platform.y);
      }
    }
  });
});
