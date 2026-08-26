import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertValidCastingRules,
  CASTING_RULES,
  CharacterCastingError,
  isCharacterRoleId,
  validateCastingRules,
  type CastingRule,
} from '../src/game/characters/castingRules';
import {
  characterRef,
  parseRoleId,
  playerRef,
  resolveCharacterRef,
  resolveCharacterRole,
  roleRef,
} from '../src/game/characters/characterRef';
import { getAllCharacters } from '../src/game/characters/characterRegistry';
import {
  getSelectedCharacterId,
  resetCharacterSelection,
  selectCharacter,
} from '../src/game/characters/characterSelection';

/**
 * Fixture registry: atmos and klaus are playable, disus is NPC-only —
 * the same shape production has.
 */
const known = getAllCharacters();

/** Mirrors the real magician rule so the shipped configuration is exercised. */
const rules = {
  magician: {
    defaultCharacter: 'disus',
    replacementsByPlayer: { disus: 'atmos' },
    allowSameAsPlayer: false,
  },
  // A cameo: the player may also appear as this NPC.
  atmosCameo: { defaultCharacter: 'atmos', allowSameAsPlayer: true },
  // Forbids duplication but has no escape hatch configured.
  strictAtmos: { defaultCharacter: 'atmos', allowSameAsPlayer: false },
} as const satisfies Record<string, CastingRule>;

beforeEach(() => {
  resetCharacterSelection();
});

describe('reference resolution', () => {
  it('resolves a player ref to whoever is selected', () => {
    selectCharacter('atmos');
    expect(resolveCharacterRef(playerRef(), rules).id).toBe('atmos');
    selectCharacter('klaus');
    expect(resolveCharacterRef(playerRef(), rules).id).toBe('klaus');
  });

  it('fails a player ref when nothing has been selected', () => {
    expect(() => resolveCharacterRef(playerRef(), rules)).toThrow(/No character selected/);
  });

  it('resolves an explicit character unchanged, including an NPC-only one', () => {
    selectCharacter('atmos');
    expect(resolveCharacterRef(characterRef('disus'), rules).id).toBe('disus');
  });

  it('never recasts an explicit character, even when it is the player', () => {
    selectCharacter('atmos');
    // The strictAtmos role would refuse this; an explicit ref does not care,
    // which is the whole point of naming someone directly.
    expect(resolveCharacterRef(characterRef('atmos'), rules).id).toBe('atmos');
  });

  it('rejects an explicit character that was never discovered', () => {
    selectCharacter('atmos');
    expect(() => resolveCharacterRef(characterRef('nobody'), rules)).toThrow(
      /was not discovered/,
    );
  });
});

describe('role casting', () => {
  it('uses the default when no replacement applies', () => {
    selectCharacter('atmos');
    expect(resolveCharacterRole('magician', rules).id).toBe('disus');
  });

  it('applies the replacement when the selected player matches', () => {
    // Stand-in for Disus becoming playable: the rule keyed on 'disus' fires.
    const disusPlayable = {
      magician: {
        defaultCharacter: 'disus',
        replacementsByPlayer: { klaus: 'atmos' },
        allowSameAsPlayer: false,
      },
    } as const satisfies Record<string, CastingRule>;
    selectCharacter('klaus');
    expect(resolveCharacterRole('magician', disusPlayable).id).toBe('atmos');
    selectCharacter('atmos');
    expect(resolveCharacterRole('magician', disusPlayable).id).toBe('disus');
  });

  it('changes who is cast when the selected player changes', () => {
    const flip = {
      guide: {
        defaultCharacter: 'atmos',
        replacementsByPlayer: { atmos: 'klaus' },
        allowSameAsPlayer: false,
      },
    } as const satisfies Record<string, CastingRule>;
    selectCharacter('klaus');
    expect(resolveCharacterRole('guide', flip).id).toBe('atmos');
    selectCharacter('atmos');
    expect(resolveCharacterRole('guide', flip).id).toBe('klaus');
  });

  it('allows the player to also perform a role that permits it', () => {
    selectCharacter('atmos');
    expect(resolveCharacterRole('atmosCameo', rules).id).toBe('atmos');
    expect(getSelectedCharacterId()).toBe('atmos');
  });

  it('refuses a collision when the role forbids it, rather than picking someone', () => {
    selectCharacter('atmos');
    expect(() => resolveCharacterRole('strictAtmos', rules)).toThrow(CharacterCastingError);
    expect(() => resolveCharacterRole('strictAtmos', rules)).toThrow(/allowSameAsPlayer: false/);
  });

  it('rejects an unknown role, listing the configured ones', () => {
    selectCharacter('atmos');
    expect(() => resolveCharacterRole('nope' as never, rules)).toThrow(/Configured roles: /);
  });

  it('rejects a role cast as a character that does not exist', () => {
    const broken = {
      ghost: { defaultCharacter: 'nobody', allowSameAsPlayer: true },
    } as const satisfies Record<string, CastingRule>;
    selectCharacter('atmos');
    expect(() => resolveCharacterRole('ghost', broken)).toThrow(/not a discovered character/);
  });

  it('resolves roles without a selection, since the default needs no player', () => {
    expect(resolveCharacterRole('magician', rules).id).toBe('disus');
  });

  it('does not mutate the selection', () => {
    selectCharacter('klaus');
    resolveCharacterRole('magician', rules);
    resolveCharacterRef(playerRef(), rules);
    resolveCharacterRef(characterRef('disus'), rules);
    expect(getSelectedCharacterId()).toBe('klaus');
  });
});

describe('casting validation', () => {
  it('accepts the shipped configuration against the discovered characters', () => {
    expect(() => assertValidCastingRules(known)).not.toThrow();
  });

  it('warns that the shipped disus replacement is inert while disus is not playable', () => {
    const report = validateCastingRules(known);
    expect(report.errors).toEqual([]);
    expect(report.warnings.join(' ')).toMatch(/"disus".*not playable/);
  });

  it('reports a default character that does not exist', () => {
    const report = validateCastingRules(known, {
      ghost: { defaultCharacter: 'nobody', allowSameAsPlayer: true },
    });
    expect(report.errors.join(' ')).toMatch(/defaultCharacter "nobody"/);
  });

  it('reports a replacement target that does not exist', () => {
    const report = validateCastingRules(known, {
      guide: {
        defaultCharacter: 'disus',
        replacementsByPlayer: { atmos: 'nobody' },
        allowSameAsPlayer: true,
      },
    });
    expect(report.errors.join(' ')).toMatch(/replaces itself with "nobody"/);
  });

  it('reports a replacement keyed on a player that does not exist', () => {
    const report = validateCastingRules(known, {
      guide: {
        defaultCharacter: 'disus',
        replacementsByPlayer: { nobody: 'atmos' },
        allowSameAsPlayer: true,
      },
    });
    expect(report.errors.join(' ')).toMatch(/keyed on player "nobody"/);
  });

  it('collects every problem at once rather than stopping at the first', () => {
    const report = validateCastingRules(known, {
      a: { defaultCharacter: 'nope1', allowSameAsPlayer: true },
      b: {
        defaultCharacter: 'nope2',
        replacementsByPlayer: { nope3: 'nope4' },
        allowSameAsPlayer: true,
      },
    });
    expect(report.errors.length).toBeGreaterThanOrEqual(4);
    expect(() =>
      assertValidCastingRules(known, {
        a: { defaultCharacter: 'nope1', allowSameAsPlayer: true },
      }),
    ).toThrow(CharacterCastingError);
  });
});

describe('shipped configuration', () => {
  it('models the Magician as a role rather than baking Disus in', () => {
    expect(isCharacterRoleId('magician')).toBe(true);
    expect(CASTING_RULES.magician.defaultCharacter).toBe('disus');
    expect(CASTING_RULES.magician.allowSameAsPlayer).toBe(false);
    expect(CASTING_RULES.magician.replacementsByPlayer.disus).toBe('atmos');
  });

  it('preserves today’s casting: player Atmos sees Disus as the Magician', () => {
    selectCharacter('atmos');
    expect(resolveCharacterRole('magician').id).toBe('disus');
  });

  it('narrows a runtime string to a role id, or rejects it', () => {
    expect(parseRoleId('magician')).toBe('magician');
    expect(() => parseRoleId('wizard')).toThrow(/Unknown story role "wizard"/);
  });
});

describe('speaker name stays independent of casting', () => {
  it('lets a line label the speaker differently from who was cast', () => {
    selectCharacter('atmos');
    const line = { speaker: roleRef('magician'), speakerName: 'THE MAGICIAN' } as const;
    const cast = resolveCharacterRef(line.speaker, rules);
    // Cast as Disus, still labelled THE MAGICIAN.
    expect(cast.id).toBe('disus');
    expect(cast.name).toBe('Disus');
    expect(line.speakerName).toBe('THE MAGICIAN');
  });

  it('falls back to the resolved character’s own name when no override is given', () => {
    selectCharacter('klaus');
    expect(resolveCharacterRef(playerRef(), rules).name).toBe('Klaus');
  });
});
