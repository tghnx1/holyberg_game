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
import { getDialogueStationAssetUrls } from '../dialogue/stationAssets';
import {
  createObstacleAnimations,
  getObstacleAnimationAssetUrls,
} from '../level/berlin/obstacleAnimations';
import {
  createCollectibleAnimations,
  getCollectibleAnimationAssetUrls,
} from '../level/berlin/collectibleAnimations';
import { createSceneryFrames, getSceneryAssetUrls } from '../level/berlin/sceneryAssets';
import { getLevel4AssetUrls } from '../level/level4/level4Assets';
import { createEmptyRhythmResult } from '../level/level4/level4Flow';
import { CLUB_ROOMS } from '../level/club/clubRooms';
import { selectFallbackCharacter } from '../characters/characterSelection';

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
  /** Preloader/router only; there is nothing here for a pause menu to freeze. */
  static readonly pausable = false;

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
    this.load.svg(
      RHYTHM_HIGHWAY_TEXTURE_KEY,
      'assets/level_3/Rhythm Highway (unchanged).svg',
    );
    this.load.svg(RHYTHM_DECK_TEXTURE_KEY, 'assets/level_3/Deck L.svg');
    for (const asset of getDialogueStationAssetUrls()) {
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
    for (const asset of getLevel4AssetUrls()) {
      this.load.image(asset.key, asset.url);
    }
    // Room stills only, ~200 KB for all three. The videos themselves are
    // never queued here; they stream in ClubScene.
    for (const room of CLUB_ROOMS) {
      this.load.image(room.posterKey, room.posterUrl);
    }
  }

  create(): void {
    createObstacleAnimations(this);
    createCollectibleAnimations(this);
    createSceneryFrames(this);

    const query = new URLSearchParams(window.location.search);
    const developmentScene = query.get('scene');
    if (import.meta.env.DEV && developmentScene) {
      // Direct routes skip Character Select, so give them a selection anyway:
      // ?character=<id> if supplied, otherwise Atmos, otherwise the first
      // playable one. This is the *only* fallback in the game — the campaign
      // itself always comes through CharacterSelectScene, and the scenes
      // treat a missing selection as the routing bug it would be.
      selectFallbackCharacter(query.get('character') ?? undefined);
    }
    if (import.meta.env.DEV && developmentScene === 'rhythm') {
      this.scene.start('RhythmScene', { score: 500 });
      return;
    }
    if (import.meta.env.DEV && developmentScene === 'level4') {
      this.scene.start('Level4Scene', { rhythmResult: createEmptyRhythmResult() });
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
      const scriptId = query.get('script') ?? 'metro-magician';
      this.scene.start('DialogueScene', { scriptId });
      return;
    }
    // Character Select comes first and starts the opening dialogue itself;
    // from there the sequence is DialogueScene -> BerlinScene ->
    // LevelCompleteScene -> ClubScene -> LevelCompleteScene -> RhythmScene ->
    // LevelCompleteScene -> Level4Scene -> LevelCompleteScene -> BossScene ->
    // ResultScene.
    this.scene.start('CharacterSelectScene');
  }
}
