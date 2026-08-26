import { CHARACTER_MANIFEST } from 'virtual:holyberg-characters';
import {
  getPlayableDefinitions,
  type CharacterDefinition,
} from './characterManifest';

/**
 * Read-only view over the characters discovered under
 * `public/assets/players`. The manifest arrives from the build-time virtual
 * module, so nothing here is maintained by hand — adding a folder is the
 * whole workflow.
 *
 * Carries no gameplay values. Speed, jump velocity, gravity, collision and
 * animation tempo belong to the level systems and are the same for every
 * character in a mode; a character supplies artwork and capabilities only.
 */

/** Every discovered character, playable or not, sorted by id. */
export function getAllCharacters(): readonly CharacterDefinition[] {
  return CHARACTER_MANIFEST;
}

/** Only those complete enough to play the campaign end to end. */
export function getPlayableCharacters(): readonly CharacterDefinition[] {
  return getPlayableDefinitions(CHARACTER_MANIFEST);
}

/** Undefined rather than throwing, for callers that are probing. */
export function findCharacter(id: string): CharacterDefinition | undefined {
  return CHARACTER_MANIFEST.find((character) => character.id === id);
}

/**
 * Throws when the id is unknown, listing what does exist — a typo in a
 * dialogue script or casting rule should say so rather than silently
 * resolving to nothing.
 */
export function getCharacter(id: string): CharacterDefinition {
  const character = findCharacter(id);
  if (!character) {
    const known = CHARACTER_MANIFEST.map((entry) => entry.id).join(', ') || '<none>';
    throw new Error(`Unknown character "${id}". Discovered characters: ${known}`);
  }
  return character;
}

export function isPlayable(id: string): boolean {
  return findCharacter(id)?.capabilities.playable === true;
}
