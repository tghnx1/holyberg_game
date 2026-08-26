/**
 * Which character performs each story role, given who the player picked.
 *
 * Deliberately a separate system from character discovery and from character
 * selection, because they answer different questions:
 *
 *   discovery  — who exists?
 *   selection  — who is the player?
 *   casting    — who performs this story role for this player?
 *
 * Nothing here may leak into `character.json`, `CharacterDefinition`, the
 * manifest or Character Select. A character folder describes artwork; a
 * casting rule describes the story.
 */

export interface CastingRule {
  /** Who plays this role when no replacement applies. */
  defaultCharacter: string;
  /**
   * Recasts the role when a particular character is the player. Keyed by the
   * selected player's id. Used when a role would otherwise be performed by
   * the same character the player controls and the story wants them distinct.
   */
  replacementsByPlayer?: Readonly<Record<string, string>>;
  /**
   * Whether the role may be performed by the selected player.
   *
   * `true` is a real option, not an oversight: a cameo where the player also
   * appears as an NPC is legitimate. `false` means the story requires two
   * different people, and a configuration that ends up with one is an error
   * rather than something to silently paper over.
   */
  allowSameAsPlayer: boolean;
}

/**
 * The only role the current game has. The opening dialogue's "THE MAGICIAN"
 * is performed by Disus today; modelling that as a role rather than baking
 * Disus into the renderer is what lets the pairing flip when the player is
 * Disus.
 *
 * Deliberately nothing else — roles are added when a scene needs one, not
 * speculatively.
 */
export const CASTING_RULES = {
  magician: {
    defaultCharacter: 'disus',
    // Anticipates Disus becoming playable: the Magician then becomes Atmos so
    // the player is never talking to themselves.
    replacementsByPlayer: { disus: 'atmos' },
    allowSameAsPlayer: false,
  },
} as const satisfies Record<string, CastingRule>;

export type CharacterRoleId = keyof typeof CASTING_RULES;

export function isCharacterRoleId(value: string): value is CharacterRoleId {
  return Object.prototype.hasOwnProperty.call(CASTING_RULES, value);
}

export function getCastingRule(role: CharacterRoleId): CastingRule {
  return CASTING_RULES[role];
}

export interface CastingValidationReport {
  /** Configuration that cannot work and should fail a build or a test. */
  errors: string[];
  /**
   * Configuration that is currently inert but probably intentional — most
   * often a replacement keyed on a character that is not playable yet.
   */
  warnings: string[];
}

/**
 * Checks the casting table against the discovered characters.
 *
 * Separated from resolution so a test or a startup check can inspect the
 * whole table at once, rather than only discovering a bad role the first time
 * a scene happens to ask for it.
 */
export function validateCastingRules(
  known: readonly { id: string; capabilities: { playable: boolean } }[],
  rules: Readonly<Record<string, CastingRule>> = CASTING_RULES,
): CastingValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const exists = (id: string): boolean => known.some((character) => character.id === id);
  const playable = (id: string): boolean =>
    known.some((character) => character.id === id && character.capabilities.playable);

  for (const [role, rule] of Object.entries(rules)) {
    if (!exists(rule.defaultCharacter)) {
      errors.push(
        `role "${role}" has defaultCharacter "${rule.defaultCharacter}", which is not a ` +
          `discovered character`,
      );
    }
    for (const [playerId, replacement] of Object.entries(rule.replacementsByPlayer ?? {})) {
      if (!exists(replacement)) {
        errors.push(
          `role "${role}" replaces itself with "${replacement}" when the player is ` +
            `"${playerId}", but "${replacement}" is not a discovered character`,
        );
      }
      if (!exists(playerId)) {
        errors.push(
          `role "${role}" has a replacement keyed on player "${playerId}", which is not a ` +
            `discovered character`,
        );
      } else if (!playable(playerId)) {
        // Inert rather than wrong: a character that cannot be selected can
        // never trigger this branch, so it is only worth a note.
        warnings.push(
          `role "${role}" has a replacement keyed on player "${playerId}", which exists but ` +
            `is not playable, so the replacement can never apply yet`,
        );
      }
    }
  }
  return { errors, warnings };
}

/** Throws on any configuration error, listing all of them at once. */
export function assertValidCastingRules(
  known: readonly { id: string; capabilities: { playable: boolean } }[],
  rules: Readonly<Record<string, CastingRule>> = CASTING_RULES,
): void {
  const { errors } = validateCastingRules(known, rules);
  if (errors.length > 0) {
    throw new CharacterCastingError(`Invalid casting configuration:\n  - ${errors.join('\n  - ')}`);
  }
}

export class CharacterCastingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterCastingError';
  }
}
