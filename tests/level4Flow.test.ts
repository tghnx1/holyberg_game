import { beforeEach, describe, expect, it } from 'vitest';
import { roleRef } from '../src/game/characters/characterRef';
import {
  resetCharacterSelection,
  selectCharacter,
} from '../src/game/characters/characterSelection';
import { buildLevel4DialogueBundle, chooseLevel4NpcCharacter, createEmptyRhythmResult } from '../src/game/level/level4/level4Flow';

beforeEach(() => {
  resetCharacterSelection();
});

describe('Level 4 casting', () => {
  it('uses the shared Magician role cast', () => {
    selectCharacter('atmos');
    const npc = chooseLevel4NpcCharacter();
    expect(npc.id).toBe('disus');
  });

  it('keeps the role resolver authoritative for another selected player', () => {
    selectCharacter('klaus');
    expect(chooseLevel4NpcCharacter().id).toBe('disus');
  });
});

describe('Level 4 dialogue bundle', () => {
  it('builds the toilet Magician beat on the captured current scene', () => {
    selectCharacter('atmos');
    const bundle = buildLevel4DialogueBundle();

    expect(bundle.script.id).toBe('level4-toilet-magician');
    expect(bundle.script.sceneId).toBe('currentScene');
    expect(bundle.script.nextScene).toBe('Level4Scene');
    expect(bundle.script.lines.map((line) => line.text)).toEqual([
      'Never doubted you for a second. Almost home.',
    ]);
    expect(bundle.script.lines[0].speaker).toEqual(roleRef('magician'));
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
