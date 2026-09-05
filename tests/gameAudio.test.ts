import { describe, expect, it, vi } from 'vitest';
import { SoundtrackController } from '../src/game/audio/GameAudio';
import { GAME_AUDIO, sceneAudioConfig } from '../src/game/audio/gameAudioCatalog';

function createBackend() {
  const sounds: { key: string; isPlaying: boolean; play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[] = [];
  return {
    sounds,
    backend: {
      addMusic(key: string) {
        const sound = {
          key,
          isPlaying: false,
          play: vi.fn(() => { sound.isPlaying = true; }),
          stop: vi.fn(() => { sound.isPlaying = false; }),
          destroy: vi.fn(),
        };
        sounds.push(sound);
        return sound;
      },
      playSfx: vi.fn(),
      setMuted: vi.fn(),
    },
  };
}

describe('game audio catalog', () => {
  it('keeps every general soundtrack start second in one scene config', () => {
    for (const scene of ['BerlinScene', 'ClubScene', 'Level4Scene', 'BossScene'] as const) {
      expect(sceneAudioConfig(scene).soundtrack).toEqual({ track: 'koaboExpanse', startAt: 0 });
    }
  });

  it('does not assign the general soundtrack to Rhythm', () => {
    expect(sceneAudioConfig('RhythmScene').soundtrack).toBeUndefined();
  });

  it('uses catalog keys rather than scene-owned filenames', () => {
    expect(GAME_AUDIO.koaboExpanse.url).toBe('assets/audio/music/koabo-expanse.mp3');
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

  it('preserves the soundtrack when a dialogue-capable next level uses the same track', () => {
    const { backend, sounds } = createBackend();
    const controller = new SoundtrackController(backend);
    controller.start(sceneAudioConfig('BerlinScene').soundtrack);
    controller.start(sceneAudioConfig('ClubScene').soundtrack);

    expect(sounds).toHaveLength(1);
    expect(sounds[0].stop).not.toHaveBeenCalled();
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
});
