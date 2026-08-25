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
import {
  ATMOS_CROUCH_FRAME_KEYS,
  ATMOS_DAMAGE_FRAME_KEY,
  ATMOS_JUMP_FRAME_KEYS,
  ATMOS_RUN_FRAME_KEYS,
  ATMOS_STAY_FRAME_KEY,
} from '../entities/Player';
import { getDialogueStationAssetUrls } from '../dialogue/stationAssets';
import { getDialoguePortraitAssetUrls } from '../dialogue/dialoguePortraitAssets';
import {
  createObstacleAnimations,
  getObstacleAnimationAssetUrls,
} from '../level/berlin/obstacleAnimations';
import {
  createCollectibleAnimations,
  getCollectibleAnimationAssetUrls,
} from '../level/berlin/collectibleAnimations';
import { createSceneryFrames, getSceneryAssetUrls } from '../level/berlin/sceneryAssets';

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

    this.load.image('berlin-train-right', 'assets/level_1/train-right.png');
    this.load.image('berlin-train-left', 'assets/level_1/train-left.png');
    for (const [index, key] of ATMOS_RUN_FRAME_KEYS.entries()) {
      this.load.image(key, `assets/players/Atmos/run ${index + 1}.png`);
    }
    for (const [index, key] of ATMOS_JUMP_FRAME_KEYS.entries()) {
      this.load.image(key, `assets/players/Atmos/jump ${index + 1}.png`);
    }
    for (const [index, key] of ATMOS_CROUCH_FRAME_KEYS.entries()) {
      this.load.image(key, `assets/players/Atmos/crouch ${index + 1}.png`);
    }
    this.load.image(ATMOS_DAMAGE_FRAME_KEY, 'assets/players/Atmos/damage 1.png');
    this.load.image(ATMOS_STAY_FRAME_KEY, 'assets/players/Atmos/stay.png');
    this.load.svg(
      RHYTHM_HIGHWAY_TEXTURE_KEY,
      'assets/level_3/Rhythm Highway (unchanged).svg',
    );
    this.load.svg(RHYTHM_DECK_TEXTURE_KEY, 'assets/level_3/Deck L.svg');
    for (const asset of getDialogueStationAssetUrls()) {
      this.load.image(asset.key, asset.url);
    }
    for (const asset of getDialoguePortraitAssetUrls()) {
      this.load.image(asset.key, asset.url);
    }
    for (const asset of getObstacleAnimationAssetUrls()) {
      this.load.image(asset.key, asset.url);
    }
    for (const asset of getCollectibleAnimationAssetUrls()) {
      this.load.image(asset.key, asset.url);
    }
    for (const asset of getSceneryAssetUrls()) {
      this.load.image(asset.key, asset.url);
    }
  }

  create(): void {
    createObstacleAnimations(this);
    createCollectibleAnimations(this);
    createSceneryFrames(this);

    const developmentScene = new URLSearchParams(window.location.search).get('scene');
    if (import.meta.env.DEV && developmentScene === 'rhythm') {
      this.scene.start('RhythmScene', { score: 500 });
      return;
    }
    if (import.meta.env.DEV && developmentScene === 'club') {
      this.scene.start('ClubScene', { score: 500 });
      return;
    }
    if (import.meta.env.DEV && developmentScene === 'boss') {
      this.scene.start('BossScene');
      return;
    }
    if (import.meta.env.DEV && developmentScene === 'dialogue') {
      const scriptId = new URLSearchParams(window.location.search).get('script') ?? 'metro-magician';
      this.scene.start('DialogueScene', { scriptId });
      return;
    }
    // DialogueScene only ever plays before BerlinScene; from there the level
    // sequence is BerlinScene -> LevelCompleteScene -> RhythmScene ->
    // LevelCompleteScene -> BossScene -> ResultScene.
    this.scene.start('DialogueScene', { scriptId: 'metro-magician' });
  }
}
