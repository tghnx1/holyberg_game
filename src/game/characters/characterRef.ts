import {
  CASTING_RULES,
  CharacterCastingError,
  isCharacterRoleId,
  type CastingRule,
  type CharacterRoleId,
} from './castingRules';
import type { CharacterDefinition } from './characterManifest';
import { findCharacter } from './characterRegistry';
import { getSelectedCharacter, getSelectedCharacterId } from './characterSelection';

/**
 * How content names a character, keeping three genuinely different meanings
 * apart instead of collapsing them into one string:
 *
 *   player    — whoever the person is controlling this session.
 *   role      — a part in the story, cast through castingRules.
 *   character — one specific discovered character, never recast.
 *
 * A typed object rather than a sentinel like '$player', so the distinction
 * survives refactoring and a typo in a role name is a compile error.
 */
export type CharacterRef =
  | { readonly type: 'player' }
  | { readonly type: 'role'; readonly role: CharacterRoleId }
  | { readonly type: 'character'; readonly characterId: string };

/** Convenience constructors, so content reads as data rather than punctuation. */
export const playerRef = (): CharacterRef => ({ type: 'player' });
export const roleRef = (role: CharacterRoleId): CharacterRef => ({ type: 'role', role });
export const characterRef = (characterId: string): CharacterRef => ({
  type: 'character',
  characterId,
});

/**
 * Resolves a story role for the character currently selected.
 *
 * Deterministic and explicit by design: a replacement if one is configured
 * for this player, otherwise the default. It never searches for "some other
 * character" — a role landing on the player when the story forbids it is a
 * configuration mistake, and quietly substituting someone would hide it and
 * make the cast depend on discovery order.
 */
export function resolveCharacterRole<
  R extends Readonly<Record<string, CastingRule>> = typeof CASTING_RULES,
>(role: Extract<keyof R, string>, rules: R = CASTING_RULES as unknown as R): CharacterDefinition {
  const rule = rules[role];
  if (!rule) {
    const known = Object.keys(rules).join(', ') || '<none>';
    throw new CharacterCastingError(`Unknown story role "${role}". Configured roles: ${known}`);
  }

  const playerId = getSelectedCharacterId();
  const replacement = playerId ? rule.replacementsByPlayer?.[playerId] : undefined;
  const castId = replacement ?? rule.defaultCharacter;

  const cast = findCharacter(castId);
  if (!cast) {
    throw new CharacterCastingError(
      `Role "${role}" is cast as "${castId}", which is not a discovered character. ` +
        `Check castingRules for that role.`,
    );
  }

  if (!rule.allowSameAsPlayer && playerId !== undefined && cast.id === playerId) {
    throw new CharacterCastingError(
      `Role "${role}" resolved to "${cast.id}", who is also the selected player, but the ` +
        `role sets allowSameAsPlayer: false. Add a replacementsByPlayer entry for ` +
        `"${playerId}", or set allowSameAsPlayer: true if the role is meant to be a cameo.`,
    );
  }

  return cast;
}

/**
 * Resolves any reference to a concrete character.
 *
 * An explicit `character` ref is returned as-is and is never recast, even
 * when it happens to be the selected player — that is the point of naming
 * someone explicitly rather than through a role.
 */
export function resolveCharacterRef(
  ref: CharacterRef,
  rules: Readonly<Record<string, CastingRule>> = CASTING_RULES,
): CharacterDefinition {
  switch (ref.type) {
    case 'player':
      return getSelectedCharacter();
    case 'role':
      return resolveCharacterRole(ref.role, rules);
    case 'character': {
      const character = findCharacter(ref.characterId);
      if (!character) {
        throw new CharacterCastingError(
          `Dialogue refers to character "${ref.characterId}", which was not discovered under ` +
            `public/assets/players.`,
        );
      }
      return character;
    }
  }
}

/** Narrows an arbitrary string to a role id, for data loaded at runtime. */
export function parseRoleId(value: string): CharacterRoleId {
  if (!isCharacterRoleId(value)) {
    throw new CharacterCastingError(`Unknown story role "${value}".`);
  }
  return value;
}
