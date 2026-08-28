import { beforeEach, describe, expect, it } from 'vitest';
import { characterRef, playerRef } from '../src/game/characters/characterRef';
import { getCharacter } from '../src/game/characters/characterRegistry';
import {
  resetCharacterSelection,
  selectCharacter,
} from '../src/game/characters/characterSelection';
import { buildLevel4DialogueBundle, chooseLevel4NpcCharacter, createEmptyRhythmResult } from '../src/game/level/level4/level4Flow';

beforeEach(() => {
  resetCharacterSelection();
});

describe('Level 4 casting', () => {
  it('picks the other playable character for the NPC', () => {
    selectCharacter('atmos');
    expect(chooseLevel4NpcCharacter().id).toBe('klaus');
  });

  it('swaps to Atmos when Klaus is the player', () => {
    selectCharacter('klaus');
    expect(chooseLevel4NpcCharacter().id).toBe('atmos');
  });
});

describe('Level 4 dialogue bundle', () => {
  it('builds the toilet intro with the selected player and a different NPC', () => {
    selectCharacter('atmos');
    const bundle = buildLevel4DialogueBundle(getCharacter('atmos'), getCharacter('klaus'));

    expect(bundle.script.sceneId).toBe('toilet');
    expect(bundle.script.nextScene).toBe('Level4Scene');
    expect(bundle.script.lines.map((line) => line.text)).toEqual([
      'привет, портал вот тут',
      'окей давай показывай',
    ]);
    expect(bundle.script.lines[0].speaker).toEqual(characterRef('klaus'));
    expect(bundle.script.lines[1].speaker).toEqual(playerRef());
    expect(bundle.sceneCast.seatedActor).toEqual({ type: 'player' });
    expect(bundle.sceneCast.arrivingActor).toEqual(characterRef('klaus'));
  });

  it('creates an empty rhythm result for direct dev routes', () => {
    expect(createEmptyRhythmResult()).toEqual({
      score: 0,
      rawScore: 0,
      maximumRawScore: 1,
      scorePenalty: 0,
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      good: 0,
      ok: 0,
      miss: 0,
      badTap: 0,
      berlinScore: 0,
      accuracy: 0,
      success: true,
    });
  });
});
