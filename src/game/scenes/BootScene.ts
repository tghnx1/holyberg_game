import Phaser from 'phaser';
import {
  getAssetQualityProfile,
  getBerlinBackgroundAssetUrls,
} from '../responsive/AssetQuality';
import {
  RHYTHM_DECK_TEXTURE_KEY,
  RHYTHM_HIGHWAY_TEXTURE_KEY,
} from '../rhythm/RhythmAssetLayout';
import { getStreetGroundAssetUrls } from '../level/berlin/streetGroundLayout';
import { getPlatformTextureAssets } from '../level/berlin/platformVisualLayout';
import { ATMOS_JUMP_FRAME_KEYS, ATMOS_RUN_FRAME_KEYS } from '../entities/Player';

function getMaxTextureSize(game: Phaser.Game): number | undefined {
  const renderer = game.renderer as unknown as { gl?: WebGLRenderingContext };
  const gl = renderer.gl;
  if (!gl) return undefined;
  const value: unknown = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  return typeof value === 'number' ? value : undefined;
}

function getViewportDimensions(scale: Phaser.Scale.ScaleManager): {
  width: number;
  height: number;
} {
  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? scale.parentSize.width ?? window.innerWidth,
    height: viewport?.height ?? scale.parentSize.height ?? window.innerHeight,
  };
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    const viewport = getViewportDimensions(this.scale);
    const qualityProfile = getAssetQualityProfile({
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      touchCapable: this.game.device.input.touch,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      maxTextureSize: getMaxTextureSize(this.game),
    });
    for (const asset of getBerlinBackgroundAssetUrls(qualityProfile)) {
      this.load.image(asset.key, asset.url);
    }
    for (const asset of getStreetGroundAssetUrls()) {
      this.load.image(asset.key, asset.url);
    }
    for (const asset of getPlatformTextureAssets()) {
      this.load.image(asset.key, asset.url);
    }
    if (import.meta.env.DEV) console.debug('[BootScene] Berlin asset profile', qualityProfile);

    this.load.image('berlin-train-right', 'assets/backgrounds/train-right.png');
    this.load.image('berlin-train-left', 'assets/backgrounds/train-left.png');
    for (const [index, key] of ATMOS_RUN_FRAME_KEYS.entries()) {
      this.load.image(key, `assets/players/Atmos/run ${index + 1}.png`);
    }
    for (const [index, key] of ATMOS_JUMP_FRAME_KEYS.entries()) {
      this.load.image(key, `assets/players/Atmos/jump ${index + 1}.png`);
    }
    this.load.svg(
      RHYTHM_HIGHWAY_TEXTURE_KEY,
      'assets/images/Rhythm Highway (unchanged).svg',
    );
    this.load.svg(RHYTHM_DECK_TEXTURE_KEY, 'assets/images/Deck L.svg');
  }

  create(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0x17101f).fillRoundedRect(0, 0, 80, 98, 18);
    graphics.fillStyle(0xff713c).fillCircle(40, 26, 21);
    graphics.fillStyle(0x21182d).fillCircle(40, 26, 12);
    graphics.fillStyle(0x15121d).fillRect(23, 45, 34, 40);
    graphics.fillStyle(0xffc74e).fillRect(13, 50, 12, 32);
    graphics.generateTexture('dj', 80, 98);
    graphics.destroy();

    const developmentScene = new URLSearchParams(window.location.search).get('scene');
    if (import.meta.env.DEV && developmentScene === 'rhythm') {
      this.scene.start('RhythmScene', { score: 500 });
      return;
    }
    this.scene.start('BerlinScene');
  }
}
