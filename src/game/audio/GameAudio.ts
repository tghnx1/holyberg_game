import type Phaser from 'phaser';
import { SoundManager } from './SoundManager';
import {
  GAME_AUDIO,
  sceneAudioConfig,
  type GameAudioId,
  type GameAudioScene,
  type SceneSoundtrack,
} from './gameAudioCatalog';

interface MusicSound {
  isPlaying: boolean;
  play: (config?: { loop?: boolean; seek?: number; volume?: number }) => unknown;
  stop: () => unknown;
  destroy: () => unknown;
}

interface AudioBackend {
  addMusic: (key: string) => MusicSound;
  playSfx: (key: string) => unknown;
  setMuted: (muted: boolean) => unknown;
}

/** Testable lifecycle guard: one shared soundtrack instance, never duplicates. */
export class SoundtrackController {
  private active?: MusicSound;
  private activeTrack?: GameAudioId;

  constructor(private readonly backend: AudioBackend) {}

  start(soundtrack: SceneSoundtrack | undefined): void {
    if (!soundtrack) {
      this.stop();
      return;
    }
    if (this.activeTrack === soundtrack.track && this.active?.isPlaying) return;
    this.stop();
    const sound = this.backend.addMusic(GAME_AUDIO[soundtrack.track].key);
    this.active = sound;
    this.activeTrack = soundtrack.track;
    sound.play({ loop: true, seek: soundtrack.startAt, volume: 0.55 });
  }

  stop(): void {
    this.active?.stop();
    this.active?.destroy();
    this.active = undefined;
    this.activeTrack = undefined;
  }

  get currentTrack(): GameAudioId | undefined {
    return this.activeTrack;
  }
}

class GameAudio {
  private readonly soundtrack: SoundtrackController;
  private readonly backend: AudioBackend;

  constructor(scene: Phaser.Scene) {
    this.backend = {
      addMusic: (key) => scene.sound.add(key) as unknown as MusicSound,
      playSfx: (key) => scene.sound.play(key),
      setMuted: (muted) => scene.sound.setMute(muted),
    };
    this.soundtrack = new SoundtrackController(this.backend);
    SoundManager.onChange((muted) => this.backend.setMuted(muted));
  }

  startSceneMusic(sceneId: GameAudioScene): void {
    this.soundtrack.start(sceneAudioConfig(sceneId).soundtrack);
  }

  stopMusic(): void {
    this.soundtrack.stop();
  }

  playSfx(id: GameAudioId): void {
    try {
      this.play(id);
    } catch {
      // Sound is optional: a failed decode or unsupported codec cannot block gameplay.
    }
  }

  private play(id: GameAudioId): void {
    const asset = GAME_AUDIO[id];
    // Phaser's global sound manager already applies SoundManager mute through
    // the subscription above, including live SOUND ON/OFF changes.
    this.backend.playSfx(asset.key);
  }
}

const audioByGame = new WeakMap<Phaser.Game, GameAudio>();

export function gameAudio(scene: Phaser.Scene): GameAudio {
  let audio = audioByGame.get(scene.game);
  if (!audio) {
    audio = new GameAudio(scene);
    audioByGame.set(scene.game, audio);
  }
  return audio;
}
