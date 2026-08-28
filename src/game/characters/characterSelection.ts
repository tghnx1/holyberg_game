import type { CharacterDefinition } from './characterManifest';
import { findCharacter, getPlayableCharacters } from './characterRegistry';

/**
 * Who the player is, for this session.
 *
 * Module-level and Phaser-free on purpose: the choice has to outlive every
 * scene transition, and a Scene's own state is destroyed at SHUTDOWN. There is
 * deliberately no persistence — reopening the game shows Character Select
 * again.
 *
 * Holds an id, never gameplay values. Selecting a character changes which
 * artwork is drawn and nothing about how anything moves.
 */

let selectedId: string | undefined;

export class CharacterSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterSelectionError';
  }
}

export function hasSelectedCharacter(): boolean {
  return selectedId !== undefined;
}

export function getSelectedCharacterId(): string | undefined {
  return selectedId;
}

/**
 * Throws when nothing has been chosen yet. Callers inside the campaign can
 * rely on a selection existing, and a missing one is a routing bug worth
 * surfacing rather than papering over with a default.
 */
export function getSelectedCharacter(): CharacterDefinition {
  if (selectedId === undefined) {
    throw new CharacterSelectionError(
      'No character selected yet. CharacterSelectScene must run before the campaign, ' +
        'or a dev entry point must call selectFallbackCharacter().',
    );
  }
  const character = findCharacter(selectedId);
  if (!character) {
    throw new CharacterSelectionError(
      `Selected character "${selectedId}" is no longer in the manifest.`,
    );
  }
  return character;
}

/**
 * Records the choice. Rejects an unknown id, and rejects a character that
 * exists but cannot be played — an NPC-only folder reaching this point means
 * the caller built its list from the wrong source, and quietly substituting
 * someone else would hide that.
 */
export function selectCharacter(id: string): CharacterDefinition {
  const character = findCharacter(id);
  if (!character) {
    const playable = getPlayableCharacters().map((entry) => entry.id).join(', ') || '<none>';
    throw new CharacterSelectionError(
      `Cannot select unknown character "${id}". Playable characters: ${playable}`,
    );
  }
  if (!character.capabilities.playable) {
    throw new CharacterSelectionError(
      `Cannot select "${character.name}": it is discoverable as an NPC but is not playable.`,
    );
  }
  selectedId = character.id;
  return character;
}

/**
 * Dev convenience for direct `?scene=` entry points, which skip Character
 * Select. An explicitly requested id is strict: an unknown or NPC-only
 * character is a bad DEV URL and must surface the same clear selection error
 * as Character Select. With no request, Atmos and then the first playable
 * character preserve the existing direct-scene fallback.
 *
 * Returns undefined only when nothing playable was discovered at all.
 */
export function selectFallbackCharacter(requestedId?: string): CharacterDefinition | undefined {
  if (requestedId !== undefined) return selectCharacter(requestedId);

  const playable = getPlayableCharacters();
  if (playable.length === 0) return undefined;
  const fallback = playable.find((entry) => entry.id === 'atmos') ?? playable[0];
  return selectCharacter(fallback.id);
}

/** Test hook; the game itself never clears a selection mid-session. */
export function resetCharacterSelection(): void {
  selectedId = undefined;
}
