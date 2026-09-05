import { describe, expect, it } from 'vitest';
import type { CharacterDefinition } from '../src/game/characters/characterManifest';
import { getPlayableCharacters } from '../src/game/characters/characterRegistry';
import {
  buildClubRoomDialogue,
  characterForClubStorySlot,
  CLUB_STORY_PLACEMENTS,
  buildPostRhythmDialogue,
  resolveClubStoryCast,
} from '../src/game/level/club/clubStory';
import { getClubStoryActorIdleAssets } from '../src/game/level/club/clubStoryActorAssets';

const character = (id: string): CharacterDefinition => ({
  id,
  name: id,
  rootUrl: '',
  capabilities: {
    playable: true,
    dialoguePortrait: true,
    metroActor: true,
    appearAnimation: false,
    walkAnimation: true,
  },
  presentation: { gameplayScale: 1, gameplayPoseScales: {}, dialogueScale: 1 },
  gameplay: { run: [], jump: [], crouch: [], damage: [], walk: [] },
  dialogue: { appear: [] },
});

describe('Club story cast', () => {
  it('resolves three distinct actors, excluding the player and Magician when possible', () => {
    const player = character('player');
    const magician = character('magician');
    const cast = resolveClubStoryCast(
      player,
      [player, magician, character('a'), character('b'), character('c'), character('d')],
      magician,
    );
    expect(new Set(Object.values(cast)).size).toBe(3);
    expect(Object.values(cast)).not.toContain(player.id);
    expect(Object.values(cast)).not.toContain(magician.id);
  });

  it('uses the Magician only when the remaining roster cannot fill all slots', () => {
    const player = character('player');
    const magician = character('magician');
    const cast = resolveClubStoryCast(
      player,
      [player, magician, character('a'), character('b')],
      magician,
    );
    expect(Object.values(cast)).toContain(magician.id);
  });

  it('fails clearly when fewer than three distinct NPCs exist', () => {
    const player = character('player');
    expect(() => resolveClubStoryCast(
      player,
      [player, character('a'), character('b')],
      character('magician'),
    )).toThrow(/three distinct playable NPCs/);
  });
});

describe('Club dialogue content', () => {
  it('registers all production script ids and keeps DJ3 for the post-set line', () => {
    expect(buildClubRoomDialogue('dj1', 'a').id).toBe('club-lounge-dj');
    expect(buildClubRoomDialogue('barkeeper', 'b').id).toBe('club-barkeeper');
    expect(buildClubRoomDialogue('dj3', 'c').id).toBe('club-dancefloor-dj');
    const after = buildPostRhythmDialogue('c');
    expect(after.id).toBe('club-post-rhythm-dj');
    expect(after.defaultSpeaker).toEqual({ type: 'character', characterId: 'c' });
  });
});

describe('Club story actor assets', () => {
  it('uses each room cast actor idle frame as the minimum story-actor load', () => {
    const [dj1, barkeeper, dj3] = getPlayableCharacters();
    const cast = { dj1Id: dj1.id, barkeeperId: barkeeper.id, dj3Id: dj3.id };
    for (const [slot, placement] of Object.entries(CLUB_STORY_PLACEMENTS) as [
      keyof typeof CLUB_STORY_PLACEMENTS,
      (typeof CLUB_STORY_PLACEMENTS)[keyof typeof CLUB_STORY_PLACEMENTS],
    ][]) {
      const actor = characterForClubStorySlot(cast, slot);
      expect(getClubStoryActorIdleAssets(placement.roomId, cast)).toEqual([actor.gameplay.idle]);
    }
  });
});
