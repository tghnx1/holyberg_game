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
import { GROUND_Y, RUN_SPEED } from '../src/game/constants';

const platforms = (level as BerlinEntity[]).filter(
  (entity): entity is PlatformConfig | MovingPlatformConfig =>
    entity.type === 'platform' || entity.type === 'movingPlatform',
);

describe('Berlin platform visual layout', () => {
  it('loads all six project-relative PNG assets', () => {
    expect(getPlatformTextureAssets()).toEqual([
      { key: 'platform-1', url: 'assets/level_1/platform_1.png' },
      { key: 'platform-2', url: 'assets/level_1/platform_2.png' },
      { key: 'platform-3', url: 'assets/level_1/platform_3.png' },
      { key: 'platform-4', url: 'assets/level_1/platform_4.png' },
      { key: 'platform-5', url: 'assets/level_1/platform_5.png' },
      { key: 'platform-6', url: 'assets/level_1/platform_6.png' },
    ]);
  });

  it('assigns a valid PNG visual to every existing static and moving platform', () => {
    expect(platforms.length).toBeGreaterThan(0);
    expect(platforms.every((platform) => getPlatformVisualLayout(platform) !== undefined)).toBe(
      true,
    );
  });

  it('uses a registered platform texture for every current platform', () => {
    const keys = platforms.map((platform) => getPlatformVisualLayout(platform)!.textureKey);
    const registeredKeys = new Set(getPlatformTextureAssets().map((asset) => asset.key));
    expect(keys.every((key) => registeredKeys.has(key))).toBe(true);
  });

  it('covers each collider width with a uniformly scaled deck', () => {
    for (const platform of platforms) {
      const layout = getPlatformVisualLayout(platform)!;
      expect(layout.scale).toBeGreaterThan(0);
      expect(layout.visibleDeckWidth).toBeCloseTo(platform.width, 8);
    }
  });

  it('keeps every current platform geometry positive and above the street', () => {
    for (const platform of platforms) {
      const layout = getPlatformVisualLayout(platform)!;
      expect(platform.width).toBeGreaterThan(0);
      expect(platform.height).toBeGreaterThan(0);
      expect(platform.topY).toBeLessThan(GROUND_Y);
      expect(layout.visibleDeckThickness).toBeGreaterThan(0);
    }
  });

  it('aligns every measured PNG surface with the physics platform top', () => {
    for (const platform of platforms) {
      const layout = getPlatformVisualLayout(platform)!;
      const zone = getBerlinEntityZoneLayout(platform);
      expect(layout.visibleSurfaceY).toBeCloseTo(platform.topY, 8);
      expect(zone.width).toBe(platform.width);
      // Odd-height authored colliders naturally have a half-pixel geometric
      // centre; their walkable top still stays within one pixel of the art.
      expect(Math.abs(zone.y - zone.height / 2 - platform.topY)).toBeLessThanOrEqual(1);
    }
  });

  it('honours explicit editor width and height while preserving the walkable surface', () => {
    const legacy = platforms[0];
    const legacyLayout = getPlatformVisualLayout(legacy)!;
    expect(legacyLayout.visibleDeckThickness).toBeCloseTo(legacy.height, 8);

    const resizedHeight = legacy.height + 12;
    const resized: PlatformConfig | MovingPlatformConfig = {
      ...legacy,
      y: legacy.topY + resizedHeight / 2,
      height: resizedHeight,
      editorSized: true,
    };
    const resizedLayout = getPlatformVisualLayout(resized)!;
    const resizedZone = getBerlinEntityZoneLayout(resized);
    expect(resizedLayout.visibleDeckWidth).toBeCloseTo(resized.width, 8);
    expect(resizedLayout.visibleDeckThickness).toBeCloseTo(resizedHeight, 8);
    expect(resizedLayout.visibleSurfaceY).toBeCloseTo(resized.topY, 8);
    expect(Math.abs(resizedZone.y - resizedZone.height / 2 - resized.topY)).toBeLessThanOrEqual(1);
  });

  it('keeps every existing moving-platform travel distance within double-jump reach', () => {
    const movingPlatforms = platforms.filter(
      (platform): platform is MovingPlatformConfig => platform.type === 'movingPlatform',
    );
    // The current two-impulse arc stays airborne longer than this conservative
    // 1.3 s budget. The test intentionally uses the unchanged RUN_SPEED.
    const conservativeDoubleJumpReach = RUN_SPEED * 1.3;

    expect(movingPlatforms.length).toBeGreaterThan(0);
    for (const platform of movingPlatforms) {
      // A player already standing on the platform can always ride its full
      // authored motion and still cross it in one double-jump arc.
      expect(platform.width + platform.movementDistance).toBeLessThanOrEqual(
        conservativeDoubleJumpReach,
      );
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
