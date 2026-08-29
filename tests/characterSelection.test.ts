import { beforeEach, describe, expect, it } from 'vitest';
import {
  findCharacter,
  getAllCharacters,
  getCharacter,
  getPlayableCharacters,
  isPlayable,
} from '../src/game/characters/characterRegistry';
import {
  CharacterSelectionError,
  getSelectedCharacter,
  getSelectedCharacterId,
  hasSelectedCharacter,
  resetCharacterSelection,
  selectCharacter,
  selectFallbackCharacter,
} from '../src/game/characters/characterSelection';

beforeEach(() => {
  resetCharacterSelection();
});

describe('character registry', () => {
  it('exposes every discovered character, NPC-only ones included', () => {
    expect(getAllCharacters().map((c) => c.id)).toEqual([
      'atmos',
      'disus',
      'doctor-doms',
      'drifter',
      'klaus',
      'mute',
    ]);
  });

  it('offers only playable characters for selection', () => {
    expect(getPlayableCharacters().map((c) => c.id)).toEqual(['atmos', 'doctor-doms', 'klaus']);
    expect(isPlayable('disus')).toBe(false);
  });

  it('looks a character up by id, and says what exists when it cannot', () => {
    expect(getCharacter('disus').name).toBe('Disus');
    expect(findCharacter('nobody')).toBeUndefined();
    expect(() => getCharacter('nobody')).toThrow(
      /Discovered characters: atmos, disus, doctor-doms, drifter, klaus, mute/,
    );
  });
});

describe('character selection', () => {
  it('starts empty, and reading it before choosing is an error rather than a default', () => {
    expect(hasSelectedCharacter()).toBe(false);
    expect(getSelectedCharacterId()).toBeUndefined();
    expect(() => getSelectedCharacter()).toThrow(CharacterSelectionError);
  });

  it('records a playable choice', () => {
    const chosen = selectCharacter('klaus');
    expect(chosen.name).toBe('Klaus');
    expect(hasSelectedCharacter()).toBe(true);
    expect(getSelectedCharacterId()).toBe('klaus');
    expect(getSelectedCharacter().id).toBe('klaus');
  });

  it('survives being read repeatedly, standing in for scene transitions', () => {
    selectCharacter('atmos');
    for (let i = 0; i < 5; i += 1) expect(getSelectedCharacter().id).toBe('atmos');
  });

  it('refuses an unknown id instead of falling back to someone', () => {
    expect(() => selectCharacter('nobody')).toThrow(/Cannot select unknown character "nobody"/);
    expect(hasSelectedCharacter()).toBe(false);
  });

  it('refuses an NPC-only character, naming why', () => {
    expect(() => selectCharacter('disus')).toThrow(/is not playable/);
    expect(hasSelectedCharacter()).toBe(false);
  });

  it('leaves an existing selection untouched when a later one is rejected', () => {
    selectCharacter('atmos');
    expect(() => selectCharacter('disus')).toThrow();
    expect(getSelectedCharacterId()).toBe('atmos');
  });

  it('carries no gameplay values, only artwork and capabilities', () => {
    const character = selectCharacter('atmos');
    for (const banned of ['speed', 'runSpeed', 'jumpVelocity', 'gravity', 'frameDurationMs']) {
      expect(character).not.toHaveProperty(banned);
    }
    expect(Object.keys(character).sort()).toEqual([
      'capabilities',
      'dialogue',
      'gameplay',
      'id',
      'name',
      'presentation',
      'rootUrl',
    ]);
  });
});

describe('dev fallback selection', () => {
  it('prefers Atmos so the existing ?scene= workflow is unchanged', () => {
    expect(selectFallbackCharacter()?.id).toBe('atmos');
  });

  it('honours an explicitly requested character', () => {
    expect(selectFallbackCharacter('klaus')?.id).toBe('klaus');
  });

  it('ignores a requested character that is not playable and falls back', () => {
    expect(selectFallbackCharacter('disus')?.id).toBe('atmos');
  });

  it('ignores an unknown request rather than throwing at a dev entry point', () => {
    expect(selectFallbackCharacter('nobody')?.id).toBe('atmos');
  });
});
