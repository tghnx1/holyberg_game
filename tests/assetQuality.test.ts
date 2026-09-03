import { describe, expect, it } from 'vitest';
import berlinBackgroundAssets from '../src/game/assets/berlinBackgroundAssets.json';
import {
  getAssetQualityProfile,
  getBerlinBackgroundAssetUrls,
  getOptimizedBerlinBackgroundUrl,
  type AssetQualityProfile,
} from '../src/game/responsive/AssetQuality';
import { getLevel4AssetUrls } from '../src/game/level/level4/level4Assets';

describe('Berlin background asset quality', () => {
  it('selects mobile assets for an iPhone 13 landscape viewport', () => {
    expect(
      getAssetQualityProfile({
        viewportWidth: 844,
        viewportHeight: 390,
        touchCapable: true,
        coarsePointer: true,
      }),
    ).toBe('mobile');
  });

  it('selects mobile assets for a modern phone in portrait', () => {
    expect(
      getAssetQualityProfile({
        viewportWidth: 390,
        viewportHeight: 844,
        touchCapable: true,
        coarsePointer: true,
      }),
    ).toBe('mobile');
  });

  it('selects medium assets for an iPad landscape viewport', () => {
    expect(
      getAssetQualityProfile({
        viewportWidth: 1024,
        viewportHeight: 768,
        touchCapable: true,
        coarsePointer: true,
      }),
    ).toBe('medium');
  });

  it('selects desktop assets for a fine-pointer non-touch desktop', () => {
    expect(
      getAssetQualityProfile({
        viewportWidth: 1920,
        viewportHeight: 1080,
        touchCapable: false,
        coarsePointer: false,
      }),
    ).toBe('desktop');
  });

  it('honours WebGL texture-size caps before viewport capabilities', () => {
    const desktop = {
      viewportWidth: 2560,
      viewportHeight: 1440,
      touchCapable: false,
      coarsePointer: false,
    };

    expect(getAssetQualityProfile({ ...desktop, maxTextureSize: 2048 })).toBe('mobile');
    expect(getAssetQualityProfile({ ...desktop, maxTextureSize: 3072 })).toBe('medium');
    expect(getAssetQualityProfile({ ...desktop, maxTextureSize: 4096 })).toBe('desktop');
    expect(
      getAssetQualityProfile({
        viewportWidth: 844,
        viewportHeight: 390,
        touchCapable: true,
        coarsePointer: true,
        maxTextureSize: 3072,
      }),
    ).toBe('mobile');
  });

  it.each<AssetQualityProfile>(['mobile', 'medium', 'desktop'])(
    'maps every stable Phaser key to its generated %s URL',
    (profile) => {
      const selected = getBerlinBackgroundAssetUrls(profile);

      expect(selected).toEqual(
        berlinBackgroundAssets.assets.map((asset) => ({
          key: asset.textureKey,
          url: `assets/generated/${asset.name}.${profile}.webp`,
        })),
      );
      for (const asset of berlinBackgroundAssets.assets) {
        expect(getOptimizedBerlinBackgroundUrl(asset.name, profile)).toBe(
          `assets/generated/${asset.name}.${profile}.webp`,
        );
      }
    },
  );
});

describe('Holyworld asset quality', () => {
  it('uses generated backgrounds on touch profiles without changing the texture key', () => {
    const desktop = getLevel4AssetUrls('desktop')[0];
    const mobile = getLevel4AssetUrls('mobile')[0];
    const medium = getLevel4AssetUrls('medium')[0];

    expect(mobile.key).toBe(desktop.key);
    expect(medium.key).toBe(desktop.key);
    expect(mobile.url).toBe('assets/generated/level4/holyworld-background.mobile.webp');
    expect(medium.url).toBe('assets/generated/level4/holyworld-background.medium.webp');
  });
});
