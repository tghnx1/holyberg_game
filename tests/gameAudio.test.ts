import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { GameAudio, SFX_VOLUME, SoundtrackController } from '../src/game/audio/GameAudio';
import { SfxManager } from '../src/game/audio/SfxManager';
import { SoundManager } from '../src/game/audio/SoundManager';
import { GAME_AUDIO, sceneAudioConfig } from '../src/game/audio/gameAudioCatalog';

/**
 * Just enough of a Phaser.Scene for `GameAudio`'s own backend wiring —
 * `scene.sound.add/play` — without a running Phaser game.
 */
function fakeScene() {
  const play = vi.fn();
  const add = vi.fn((key: string) => ({
    key,
    isPlaying: false,
    play: vi.fn(),
    setVolume: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
  }));
  const scene = { sound: { add, play } } as unknown as Phaser.Scene;
  return { scene, play, add };
}

function createBackend() {
  const sounds: {
    key: string;
    isPlaying: boolean;
    play: ReturnType<typeof vi.fn>;
    setVolume: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }[] = [];
  return {
    sounds,
    backend: {
      addMusic(key: string) {
        const sound = {
          key,
          isPlaying: false,
          play: vi.fn(() => { sound.isPlaying = true; }),
          setVolume: vi.fn(),
          stop: vi.fn(() => { sound.isPlaying = false; }),
          destroy: vi.fn(),
        };
        sounds.push(sound);
        return sound;
      },
      playSfx: vi.fn(),
    },
  };
}

describe('game audio catalog', () => {
  it('assigns level-specific soundtracks while preserving each scene start offset', () => {
    expect(sceneAudioConfig('BerlinScene').soundtrack).toEqual({ track: 'city', startAt: 0 });
    expect(sceneAudioConfig('ClubScene').soundtrack).toEqual({ track: 'koaboExpanse', startAt: 0 });
    expect(sceneAudioConfig('Level4Scene').soundtrack).toEqual({ track: 'toiletLevel', startAt: 0 });
    expect(sceneAudioConfig('BossScene').soundtrack).toEqual({ track: 'bossFight', startAt: 0 });
  });

  it('does not assign the general soundtrack to Rhythm', () => {
    expect(sceneAudioConfig('RhythmScene').soundtrack).toBeUndefined();
  });

  it('uses catalog keys rather than scene-owned filenames', () => {
    expect(GAME_AUDIO.koaboExpanse.url).toBe('assets/audio/music/koabo-expanse.mp3');
    expect(GAME_AUDIO.city.url).toBe('assets/audio/music/city.mp3');
    expect(GAME_AUDIO.toiletLevel.url).toBe('assets/audio/music/toilet-level.mp3');
    expect(GAME_AUDIO.bossFight.url).toBe('assets/audio/music/boss-fight.mp3');
    expect(GAME_AUDIO.jump.url).toBe('assets/audio/sfx/jump.wav');
  });
});

describe('persistent soundtrack lifecycle', () => {
  it('does not create a duplicate for the same already-playing soundtrack', () => {
    const { backend, sounds } = createBackend();
    const controller = new SoundtrackController(backend);
    const soundtrack = sceneAudioConfig('BerlinScene').soundtrack;

    controller.start(soundtrack);
    controller.start(soundtrack);

    expect(sounds).toHaveLength(1);
    expect(sounds[0].play).toHaveBeenCalledWith({ loop: true, seek: 0, volume: 0.55 });
  });

  it('replaces the soundtrack when the next level uses its own track', () => {
    const { backend, sounds } = createBackend();
    const controller = new SoundtrackController(backend);
    controller.start(sceneAudioConfig('BerlinScene').soundtrack);
    controller.start(sceneAudioConfig('ClubScene').soundtrack);

    expect(sounds).toHaveLength(2);
    expect(sounds[0].stop).toHaveBeenCalledOnce();
    expect(sounds[0].destroy).toHaveBeenCalledOnce();
    expect(sounds[1].key).toBe(GAME_AUDIO.koaboExpanse.key);
  });

  it('stops music when entering the dedicated Rhythm audio mode', () => {
    const { backend, sounds } = createBackend();
    const controller = new SoundtrackController(backend);
    controller.start(sceneAudioConfig('ClubScene').soundtrack);
    controller.start(sceneAudioConfig('RhythmScene').soundtrack);

    expect(sounds[0].stop).toHaveBeenCalledOnce();
    expect(sounds[0].destroy).toHaveBeenCalledOnce();
    expect(controller.currentTrack).toBeUndefined();
  });

  it('applies a music mute and volume change to the active soundtrack only', () => {
    const { backend, sounds } = createBackend();
    const controller = new SoundtrackController(backend);
    controller.start(sceneAudioConfig('BerlinScene').soundtrack);

    controller.setMuted(true);
    expect(sounds[0].setVolume).toHaveBeenLastCalledWith(0);

    controller.setMuted(false);
    controller.setVolume(0.4);
    expect(sounds[0].setVolume).toHaveBeenLastCalledWith(0.4);
  });
});

describe('GameAudio.playSfx', () => {
  afterEach(() => {
    // Session-wide singleton: reset between tests so cases don't leak state.
    SfxManager.setMuted(false);
    SfxManager.setVolume(SFX_VOLUME);
    SoundManager.setMuted(false);
    SoundManager.setVolume(0.55);
  });

  it('plays a one-shot sound at the reduced SFX_VOLUME, not full volume', () => {
    const { scene, play } = fakeScene();
    const audio = new GameAudio(scene);

    audio.playSfx('jump');

    expect(play).toHaveBeenCalledWith(GAME_AUDIO.jump.key, { volume: SFX_VOLUME });
    expect(SFX_VOLUME).toBeLessThan(1);
  });

  it('is skipped entirely while SfxManager is muted', () => {
    const { scene, play } = fakeScene();
    const audio = new GameAudio(scene);
    SfxManager.setMuted(true);

    audio.playSfx('jump');

    expect(play).not.toHaveBeenCalled();
  });

  it('resumes playing once SfxManager is unmuted again', () => {
    const { scene, play } = fakeScene();
    const audio = new GameAudio(scene);
    SfxManager.setMuted(true);
    audio.playSfx('jump');
    expect(play).not.toHaveBeenCalled();

    SfxManager.setMuted(false);
    audio.playSfx('token');

    expect(play).toHaveBeenCalledWith(GAME_AUDIO.token.key, { volume: SFX_VOLUME });
  });

  it('keeps SFX enabled when music is muted and uses the current SFX volume', () => {
    const { scene, play } = fakeScene();
    const audio = new GameAudio(scene);
    SoundManager.setMuted(true);
    SfxManager.setVolume(0.7);

    audio.playSfx('jump');

    expect(play).toHaveBeenCalledWith(GAME_AUDIO.jump.key, { volume: 0.7 });
  });

  it('never throws even if the backend play call itself throws', () => {
    const { scene, play } = fakeScene();
    play.mockImplementation(() => {
      throw new Error('decode failed');
    });
    const audio = new GameAudio(scene);

    expect(() => audio.playSfx('jump')).not.toThrow();
  });
});
