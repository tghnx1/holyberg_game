import type Phaser from 'phaser';
import { DEFAULT_AUDIO_VOLUME, SoundManager } from './SoundManager';
import { SfxManager } from './SfxManager';
import {
  GAME_AUDIO,
  sceneAudioConfig,
  type GameAudioId,
  type GameAudioScene,
  type SceneSoundtrack,
} from './gameAudioCatalog';

/**
 * One-shot SFX play noticeably louder than the mix at full (1.0) volume —
 * "system sounds" (jumps, pickups, hits, UI stingers) stacking on top of
 * music read as noisy rather than as feedback. Music is unaffected: its own
 * volume is set separately in `SoundtrackController.start`.
 */
export const SFX_VOLUME = DEFAULT_AUDIO_VOLUME;

interface MusicSound {
  isPlaying: boolean;
  play: (config?: { loop?: boolean; seek?: number; volume?: number }) => unknown;
  setVolume: (volume: number) => unknown;
  stop: () => unknown;
  destroy: () => unknown;
}

interface AudioBackend {
  addMusic: (key: string) => MusicSound;
  playSfx: (key: string, volume: number) => unknown;
}

/** Testable lifecycle guard: one shared soundtrack instance, never duplicates. */
export class SoundtrackController {
  private active?: MusicSound;
  private activeTrack?: GameAudioId;
  private muted = false;
  private volume = DEFAULT_AUDIO_VOLUME;

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
    sound.play({ loop: true, seek: soundtrack.startAt, volume: this.effectiveVolume });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.applyVolume();
  }

  private get effectiveVolume(): number {
    return this.muted ? 0 : this.volume;
  }

  private applyVolume(): void {
    this.active?.setVolume(this.effectiveVolume);
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

export class GameAudio {
  private readonly soundtrack: SoundtrackController;
  private readonly backend: AudioBackend;

  constructor(scene: Phaser.Scene) {
    this.backend = {
      addMusic: (key) => scene.sound.add(key) as unknown as MusicSound,
      playSfx: (key, volume) => scene.sound.play(key, { volume }),
    };
    this.soundtrack = new SoundtrackController(this.backend);
    // Music gets its own gain: never use Phaser's global mute here, because
    // it would also silence one-shot system SFX.
    SoundManager.onChange((muted) => this.soundtrack.setMuted(muted));
    SoundManager.onVolumeChange((volume) => this.soundtrack.setVolume(volume));
  }

  startSceneMusic(sceneId: GameAudioScene): void {
    try {
      this.soundtrack.start(sceneAudioConfig(sceneId).soundtrack);
    } catch {
      // Music is atmospheric only. A failed load/decode must not prevent a
      // scene from becoming playable, and leaves no half-active track behind.
      this.soundtrack.stop();
    }
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
    // SfxManager is independent from music — skipped entirely here rather
    // than through Phaser's global mute.
    if (SfxManager.isMuted) return;
    const asset = GAME_AUDIO[id];
    this.backend.playSfx(asset.key, SfxManager.currentVolume);
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
