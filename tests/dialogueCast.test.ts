import { beforeEach, describe, expect, it } from 'vitest';
import { characterRef, playerRef, roleRef } from '../src/game/characters/characterRef';
import { getCharacter } from '../src/game/characters/characterRegistry';
import {
  resetCharacterSelection,
  selectCharacter,
} from '../src/game/characters/characterSelection';
import { collectCharacterAssets } from '../src/game/characters/characterAssets';
import {
  assertDialogueCastCapabilities,
  DIALOGUE_ASSET_GROUPS,
  DIALOGUE_SCENE_CASTS,
  DialogueCastError,
  resolveDialogueCast,
  resolveDialogueSpeaker,
  resolveSceneCast,
} from '../src/game/dialogue/dialogueCast';
import { METRO_MAGICIAN_DIALOGUE } from '../src/game/dialogue/dialogueScripts';
import type { DialogueScript } from '../src/game/dialogue/types';

const script = (overrides: Partial<DialogueScript>): DialogueScript => ({
  id: 'test',
  sceneId: 'metroStation',
  defaultSpeaker: roleRef('magician'),
  lines: [{ text: 'HI' }],
  nextScene: 'BerlinScene',
  ...overrides,
});

beforeEach(() => {
  resetCharacterSelection();
  selectCharacter('atmos');
});

describe('speaker resolution', () => {
  it('resolves a player ref to the selected character', () => {
    const s = script({ lines: [{ text: 'HI', speaker: playerRef() }] });
    expect(resolveDialogueSpeaker(s.lines[0], s).character.id).toBe('atmos');
    selectCharacter('klaus');
    expect(resolveDialogueSpeaker(s.lines[0], s).character.id).toBe('klaus');
  });

  it('resolves a role ref through casting', () => {
    const s = script({ lines: [{ text: 'HI', speaker: roleRef('magician') }] });
    expect(resolveDialogueSpeaker(s.lines[0], s).character.id).toBe('disus');
  });

  it('resolves an explicit character exactly, never recast', () => {
    const s = script({ lines: [{ text: 'HI', speaker: characterRef('atmos') }] });
    expect(resolveDialogueSpeaker(s.lines[0], s).character.id).toBe('atmos');
  });

  it('falls back to the script default when a line has no speaker', () => {
    const s = script({ defaultSpeaker: roleRef('magician'), lines: [{ text: 'HI' }] });
    expect(resolveDialogueSpeaker(s.lines[0], s).character.id).toBe('disus');
  });

  it('lets a line override the script default', () => {
    const s = script({
      defaultSpeaker: roleRef('magician'),
      lines: [{ text: 'HI', speaker: playerRef() }],
    });
    expect(resolveDialogueSpeaker(s.lines[0], s).character.id).toBe('atmos');
  });
});

describe('displayed name', () => {
  it('uses the character name when no override is given', () => {
    const s = script({ lines: [{ text: 'HI', speaker: playerRef() }] });
    expect(resolveDialogueSpeaker(s.lines[0], s).displayName).toBe('Atmos');
  });

  it('prefers an explicit override, which is how THE MAGICIAN stays labelled', () => {
    const s = script({
      lines: [{ text: 'HI', speaker: roleRef('magician'), speakerName: 'THE MAGICIAN' }],
    });
    const resolved = resolveDialogueSpeaker(s.lines[0], s);
    expect(resolved.character.id).toBe('disus');
    expect(resolved.displayName).toBe('THE MAGICIAN');
  });

  it('follows the selected character when the line has no override', () => {
    const s = script({ lines: [{ text: 'HI', speaker: playerRef() }] });
    selectCharacter('klaus');
    expect(resolveDialogueSpeaker(s.lines[0], s).displayName).toBe('Klaus');
  });
});

describe('the shipped opening dialogue', () => {
  it('alternates Magician, player, Magician and resolves each correctly', () => {
    const ids = METRO_MAGICIAN_DIALOGUE.lines.map(
      (line) => resolveDialogueSpeaker(line, METRO_MAGICIAN_DIALOGUE).character.id,
    );
    expect(ids).toEqual(['disus', 'atmos', 'disus', 'disus']);
  });

  it('keeps the Magician label while cast as Disus', () => {
    const names = METRO_MAGICIAN_DIALOGUE.lines.map(
      (line) => resolveDialogueSpeaker(line, METRO_MAGICIAN_DIALOGUE).displayName,
    );
    expect(names).toEqual(['THE MAGICIAN', 'Atmos', 'THE MAGICIAN', 'THE MAGICIAN']);
  });

  it('makes the player line follow whoever is selected', () => {
    selectCharacter('klaus');
    const resolved = resolveDialogueSpeaker(
      METRO_MAGICIAN_DIALOGUE.lines[1],
      METRO_MAGICIAN_DIALOGUE,
    );
    expect(resolved.character.id).toBe('klaus');
    expect(resolved.displayName).toBe('Klaus');
  });
});

describe('scene actors', () => {
  it('configures the metro cast as references, not characters', () => {
    expect(DIALOGUE_SCENE_CASTS.metroStation.seatedActor).toEqual({ type: 'player' });
    expect(DIALOGUE_SCENE_CASTS.metroStation.arrivingActor).toEqual({
      type: 'role',
      role: 'magician',
    });
  });

  it('seats the player and lands the Magician role', () => {
    const cast = resolveSceneCast(METRO_MAGICIAN_DIALOGUE);
    expect(cast.seated.id).toBe('atmos');
    expect(cast.arriving.id).toBe('disus');
  });

  it('reseats when the selected character changes', () => {
    selectCharacter('klaus');
    expect(resolveSceneCast(METRO_MAGICIAN_DIALOGUE).seated.id).toBe('klaus');
  });
});

describe('cast collection for loading', () => {
  it('lists only the characters this dialogue can show', () => {
    const cast = resolveDialogueCast(METRO_MAGICIAN_DIALOGUE).map((c) => c.id).sort();
    expect(cast).toEqual(['atmos', 'disus']);
  });

  it('collapses a character that is both player and speaker to one entry', () => {
    const s = script({
      lines: [
        { text: 'A', speaker: playerRef() },
        { text: 'B', speaker: characterRef('atmos') },
        { text: 'C', speaker: playerRef() },
      ],
    });
    const ids = resolveDialogueCast(s).map((c) => c.id);
    expect(ids.filter((id) => id === 'atmos')).toHaveLength(1);
  });

  it('never returns every discovered character', () => {
    const cast = resolveDialogueCast(METRO_MAGICIAN_DIALOGUE);
    expect(cast.length).toBeLessThan(3);
  });
});

describe('capability validation', () => {
  it('accepts the shipped dialogue with Atmos selected', () => {
    expect(() => assertDialogueCastCapabilities(METRO_MAGICIAN_DIALOGUE)).not.toThrow();
  });

  it('accepts it for any playable character', () => {
    selectCharacter('klaus');
    expect(() => assertDialogueCastCapabilities(METRO_MAGICIAN_DIALOGUE)).not.toThrow();
  });

  it('rejects a speaker with no portrait, naming the dialogue and character', () => {
    const s = script({ id: 'no-portrait', lines: [{ text: 'HI', speaker: characterRef('mute') }] });
    expect(() => assertDialogueCastCapabilities(s)).toThrow(DialogueCastError);
    expect(() => assertDialogueCastCapabilities(s)).toThrow(/no-portrait/);
    expect(() => assertDialogueCastCapabilities(s)).toThrow(/Mute/);
    expect(() => assertDialogueCastCapabilities(s)).toThrow(/portrait\/idle\.png/);
    expect(() => assertDialogueCastCapabilities(s)).toThrow(/\{ character: mute \}/);
  });

  it('rejects a seated actor with no metro pose', () => {
    // Disus is NPC-only and has no metro_sit; casting it as the seated actor
    // is exactly the failure this guard exists for.
    const s = script({ id: 'bad-seat', lines: [{ text: 'HI', speaker: playerRef() }] });
    const original = DIALOGUE_SCENE_CASTS.metroStation.seatedActor;
    (DIALOGUE_SCENE_CASTS.metroStation as { seatedActor: unknown }).seatedActor =
      characterRef('disus');
    try {
      expect(() => assertDialogueCastCapabilities(s)).toThrow(DialogueCastError);
      expect(() => assertDialogueCastCapabilities(s)).toThrow(/metro_sit\.png/);
      expect(() => assertDialogueCastCapabilities(s)).toThrow(/bad-seat/);
    } finally {
      (DIALOGUE_SCENE_CASTS.metroStation as { seatedActor: unknown }).seatedActor = original;
    }
  });

  it('rejects an arriving actor with no appear animation', () => {
    // Atmos has no dialogue/appear frames, so casting it as the arriving
    // actor must fail rather than silently showing nothing. This is the
    // future case: a replacement activating and landing on a character
    // without the scene-required animation.
    const s = script({ id: 'bad-arrival', lines: [{ text: 'HI', speaker: playerRef() }] });
    const original = DIALOGUE_SCENE_CASTS.metroStation.arrivingActor;
    (DIALOGUE_SCENE_CASTS.metroStation as { arrivingActor: unknown }).arrivingActor =
      characterRef('atmos');
    try {
      expect(() => assertDialogueCastCapabilities(s)).toThrow(/dialogue\/appear/);
      expect(() => assertDialogueCastCapabilities(s)).toThrow(/Atmos/);
    } finally {
      (DIALOGUE_SCENE_CASTS.metroStation as { arrivingActor: unknown }).arrivingActor = original;
    }
  });

  it('fails a line with no speaker and no script default', () => {
    const s = { ...script({}), defaultSpeaker: undefined } as unknown as DialogueScript;
    expect(() => resolveDialogueSpeaker(s.lines[0], s)).toThrow(/no speaker and no defaultSpeaker/);
  });
});

describe('no selection is an error, never a silent default', () => {
  it('fails to resolve a player ref rather than falling back to Atmos', () => {
    resetCharacterSelection();
    const s = script({ lines: [{ text: 'HI', speaker: playerRef() }] });
    expect(() => resolveDialogueSpeaker(s.lines[0], s)).toThrow(/No character selected/);
    expect(() => resolveSceneCast(METRO_MAGICIAN_DIALOGUE)).toThrow(/No character selected/);
    expect(() => assertDialogueCastCapabilities(METRO_MAGICIAN_DIALOGUE)).toThrow(
      /No character selected/,
    );
  });
});

describe('the arriving actor needs a pose to settle on', () => {
  it('accepts a character with both an entrance and an idle', () => {
    const disus = getCharacter('disus');
    expect(disus.capabilities.appearAnimation).toBe(true);
    expect(disus.gameplay.idle).toBeDefined();
    expect(() => assertDialogueCastCapabilities(METRO_MAGICIAN_DIALOGUE)).not.toThrow();
  });

  it('rejects an entrance with no idle to settle on', () => {
    const s = script({ id: 'no-settle', lines: [{ text: 'HI', speaker: playerRef() }] });
    const original = DIALOGUE_SCENE_CASTS.metroStation.arrivingActor;
    (DIALOGUE_SCENE_CASTS.metroStation as { arrivingActor: unknown }).arrivingActor =
      characterRef('drifter');
    try {
      expect(() => assertDialogueCastCapabilities(s)).toThrow(DialogueCastError);
      expect(() => assertDialogueCastCapabilities(s)).toThrow(/gameplay\/idle\.png/);
      expect(() => assertDialogueCastCapabilities(s)).toThrow(/no-settle/);
      expect(() => assertDialogueCastCapabilities(s)).toThrow(/Drifter/);
      // The entrance itself is fine; only the settled pose is missing.
      expect(() => assertDialogueCastCapabilities(s)).not.toThrow(/dialogue\/appear/);
    } finally {
      (DIALOGUE_SCENE_CASTS.metroStation as { arrivingActor: unknown }).arrivingActor = original;
    }
  });
});

describe('everything the metro scene draws is actually loaded', () => {
  /** Exactly what DialogueScene.preload queues, per cast member. */
  const queuedKeys = (script: DialogueScript): Set<string> =>
    new Set(
      resolveDialogueCast(script).flatMap((character) =>
        collectCharacterAssets(character, DIALOGUE_ASSET_GROUPS).map((ref) => ref.key),
      ),
    );

  it('queues the arriving actor’s settled idle, not just its entrance', () => {
    // Regression: the settled pose is gameplay/idle.png, which the dialogue
    // groups originally omitted, so the actor became a missing-texture square
    // the moment its entrance finished.
    const cast = resolveSceneCast(METRO_MAGICIAN_DIALOGUE);
    const keys = queuedKeys(METRO_MAGICIAN_DIALOGUE);
    expect(cast.arriving.gameplay.idle).toBeDefined();
    expect(keys.has(cast.arriving.gameplay.idle!.key)).toBe(true);
  });

  it('queues every frame of the arriving actor’s entrance', () => {
    const cast = resolveSceneCast(METRO_MAGICIAN_DIALOGUE);
    const keys = queuedKeys(METRO_MAGICIAN_DIALOGUE);
    expect(cast.arriving.dialogue.appear.length).toBeGreaterThan(0);
    for (const frame of cast.arriving.dialogue.appear) expect(keys.has(frame.key)).toBe(true);
  });

  it('queues the seated actor’s pose and both portraits of every speaker', () => {
    const cast = resolveSceneCast(METRO_MAGICIAN_DIALOGUE);
    const keys = queuedKeys(METRO_MAGICIAN_DIALOGUE);
    expect(keys.has(cast.seated.dialogue.metroSit!.key)).toBe(true);
    for (const line of METRO_MAGICIAN_DIALOGUE.lines) {
      const { character } = resolveDialogueSpeaker(line, METRO_MAGICIAN_DIALOGUE);
      expect(keys.has(character.dialogue.portraitIdle!.key)).toBe(true);
      expect(keys.has(character.dialogue.portraitTalk!.key)).toBe(true);
    }
  });

  it('still does not pull the run, jump, crouch or damage sets', () => {
    const keys = [...queuedKeys(METRO_MAGICIAN_DIALOGUE)];
    for (const group of ['run', 'jump', 'crouch', 'damage']) {
      expect(keys.some((key) => key.includes(`:gameplay:${group}:`))).toBe(false);
    }
  });
});

describe('portrait assets come from the manifest', () => {
  it('uses the resolved character’s discovered portrait keys', () => {
    const disus = getCharacter('disus');
    expect(disus.dialogue.portraitIdle?.key).toBe('character:disus:dialogue:portrait:idle');
    expect(disus.dialogue.portraitTalk?.key).toBe('character:disus:dialogue:portrait:talk');
  });

  it('needs no hand-maintained speaker registry to find them', () => {
    const s = script({ lines: [{ text: 'HI', speaker: roleRef('magician') }] });
    const { character } = resolveDialogueSpeaker(s.lines[0], s);
    expect(character.dialogue.portraitIdle).toBeDefined();
    expect(character.dialogue.portraitTalk).toBeDefined();
  });
});
