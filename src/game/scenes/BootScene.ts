import Phaser from 'phaser';
import {
  getBerlinBackgroundAssetUrls,
  getRuntimeAssetQualityProfile,
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
} from '../collectibles/collectibleAnimations';
import { createSceneryFrames, getSceneryAssetUrls } from '../level/berlin/sceneryAssets';
import { createEmptyRhythmResult } from '../level/level4/level4Flow';
import { selectFallbackCharacter } from '../characters/characterSelection';

export class BootScene extends Phaser.Scene {
  /** Preloader/router only; there is nothing here for a pause menu to freeze. */
  static readonly pausable = false;

  constructor() {
    super('BootScene');
  }

  preload(): void {
    const qualityProfile = getRuntimeAssetQualityProfile(this.game, this.scale);
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
    // Later campaign packages are not part of Berlin's blocking boot. Their
    // owning scenes keep independent cold-load paths while the current scene
    // progressively warms the next package.
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
      this.scene.start('RhythmScene', {
        score: 500,
      });
      return;
    }
    if (import.meta.env.DEV && developmentScene === 'level4') {
      this.scene.start('Level4Scene', {
        rhythmResult: createEmptyRhythmResult(),
        devDialogue: query.get('dialogue') === '1',
      });
      return;
    }
    if (import.meta.env.DEV && developmentScene === 'club') {
      this.scene.start('ClubScene', {
        score: 500,
        devRoomId: query.get('room') ?? undefined,
        devDialogue: query.get('dialogue') === '1',
      });
      return;
    }
    if (import.meta.env.DEV && developmentScene === 'boss') {
      this.scene.start('BossScene', { devEnding: query.get('ending') === '1' });
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
    // LevelCompleteScene -> DialogueScene -> Level4Scene ->
    // LevelCompleteScene -> BossScene -> DialogueScene ->
    // LevelCompleteScene -> ResultScene.
    this.scene.start('CharacterSelectScene');
  }
}
