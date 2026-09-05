import type Phaser from 'phaser';

export type GameAudioId =
  | 'koaboExpanse'
  | 'bossLightningHit'
  | 'clubDjMusicStop'
  | 'level4Door'
  | 'bossLightningDamage'
  | 'disusAppearDisappear'
  | 'rhythmGameEnd'
  | 'bossLightningCharge'
  | 'jump'
  | 'doubleJump'
  | 'bossIntro'
  | 'token'
  | 'trainDeparture';

export type GameAudioKind = 'music' | 'sfx';

export interface GameAudioAsset {
  key: string;
  url: string;
  kind: GameAudioKind;
}

/** The only filename-to-key mapping for the non-rhythm game audio. */
export const GAME_AUDIO: Record<GameAudioId, GameAudioAsset> = {
  koaboExpanse: { key: 'audio:music:koabo-expanse', url: 'assets/audio/music/koabo-expanse.mp3', kind: 'music' },
  bossLightningHit: { key: 'audio:sfx:boss-lightning-hit', url: 'assets/audio/sfx/boss-lightning-hit.wav', kind: 'sfx' },
  clubDjMusicStop: { key: 'audio:sfx:club-dj-music-stop', url: 'assets/audio/sfx/club-dj-music-stop.mp3', kind: 'sfx' },
  level4Door: { key: 'audio:sfx:level4-door', url: 'assets/audio/sfx/level4-door.mp3', kind: 'sfx' },
  bossLightningDamage: { key: 'audio:sfx:boss-lightning-damage', url: 'assets/audio/sfx/boss-lightning-damage.wav', kind: 'sfx' },
  disusAppearDisappear: { key: 'audio:sfx:disus-appear-disappear', url: 'assets/audio/sfx/disus-appear-disappear.mp3', kind: 'sfx' },
  rhythmGameEnd: { key: 'audio:sfx:rhythm-game-end', url: 'assets/audio/sfx/rhythm-game-end.mp3', kind: 'sfx' },
  bossLightningCharge: { key: 'audio:sfx:boss-lightning-charge', url: 'assets/audio/sfx/boss-lightning-charge.mp3', kind: 'sfx' },
  jump: { key: 'audio:sfx:jump', url: 'assets/audio/sfx/jump.wav', kind: 'sfx' },
  doubleJump: { key: 'audio:sfx:double-jump', url: 'assets/audio/sfx/double-jump.wav', kind: 'sfx' },
  bossIntro: { key: 'audio:sfx:boss-intro', url: 'assets/audio/sfx/boss-intro.mp3', kind: 'sfx' },
  token: { key: 'audio:sfx:token', url: 'assets/audio/sfx/token.wav', kind: 'sfx' },
  trainDeparture: { key: 'audio:sfx:train-departure', url: 'assets/audio/sfx/train-departure.mp3', kind: 'sfx' },
};

export type GameAudioScene = 'BerlinScene' | 'ClubScene' | 'Level4Scene' | 'BossScene' | 'RhythmScene' | 'DialogueScene';

export interface SceneSoundtrack {
  track: GameAudioId;
  /** The only value to edit to change this stage's soundtrack seek time. */
  startAt: number;
}

export interface SceneAudioConfig {
  soundtrack?: SceneSoundtrack;
  requiredSfx: readonly GameAudioId[];
}

/**
 * Global gameplay audio plan. `startAt` is intentionally authored here, not
 * in individual scenes, so soundtrack timing has one obvious source of truth.
 */
export const SCENE_AUDIO: Record<GameAudioScene, SceneAudioConfig> = {
  BerlinScene: { soundtrack: { track: 'koaboExpanse', startAt: 0 }, requiredSfx: ['jump', 'doubleJump', 'token'] },
  ClubScene: { soundtrack: { track: 'koaboExpanse', startAt: 0 }, requiredSfx: ['clubDjMusicStop'] },
  Level4Scene: { soundtrack: { track: 'koaboExpanse', startAt: 0 }, requiredSfx: ['level4Door', 'disusAppearDisappear'] },
  BossScene: { soundtrack: { track: 'koaboExpanse', startAt: 0 }, requiredSfx: ['bossIntro', 'bossLightningCharge', 'bossLightningHit', 'bossLightningDamage', 'token'] },
  RhythmScene: { requiredSfx: ['rhythmGameEnd'] },
  DialogueScene: { requiredSfx: ['disusAppearDisappear', 'trainDeparture'] },
};

export function sceneAudioConfig(scene: GameAudioScene): SceneAudioConfig {
  return SCENE_AUDIO[scene];
}

/** Queues only assets the current scene can use; no Boot-wide audio preload. */
export function queueSceneAudio(scene: Phaser.Scene, sceneId: GameAudioScene): void {
  const config = sceneAudioConfig(sceneId);
  const assetIds = [config.soundtrack?.track, ...config.requiredSfx].filter(
    (id): id is GameAudioId => id !== undefined,
  );
  for (const id of assetIds) {
    const asset = GAME_AUDIO[id];
    if (!scene.cache.audio.exists(asset.key)) scene.load.audio(asset.key, asset.url);
  }
}
