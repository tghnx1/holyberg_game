import type { CharacterDefinition } from '../characters/characterManifest';
import {
  playerRef,
  resolveCharacterRef,
  roleRef,
  type CharacterRef,
} from '../characters/characterRef';
import type { CharacterAssetGroup } from '../characters/characterAssets';
import type { DialogueLine, DialogueSceneId, DialogueScript } from './types';

/**
 * Who performs what in a dialogue, resolved from character references.
 *
 * Phaser-free, so casting and capability rules are testable without a running
 * scene, and so no renderer has to contain casting logic.
 */

/**
 * Everything a dialogue can draw of a character, and therefore everything
 * DialogueScene loads for each member of the cast.
 *
 * `idle` is in here because the arriving actor settles on that pose once its
 * entrance finishes — it is not only a Character Select preview. Declared
 * once so the scene and its regression test cannot drift apart.
 */
export const DIALOGUE_ASSET_GROUPS: readonly CharacterAssetGroup[] = [
  'portrait',
  'metroPose',
  'appear',
  'idle',
];

export interface ResolvedDialogueSpeaker {
  character: CharacterDefinition;
  /** What the bottom bar shows, which need not be the character's own name. */
  displayName: string;
}

export class DialogueCastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DialogueCastError';
  }
}

/**
 * Physical actors each prebuilt dialogue scene puts on screen, as references
 * rather than characters.
 *
 * Kept out of StationSceneView on purpose: the renderer draws whoever it is
 * handed, and the story decides who that is. A future dialogue scene declares
 * its own entry here rather than growing another set of hardcoded names.
 */
export interface DialogueSceneCast {
  /** Sits on the platform for the whole scene. */
  seatedActor: CharacterRef;
  /** Walks on once the train leaves. */
  arrivingActor: CharacterRef;
}

export const DIALOGUE_SCENE_CASTS: Readonly<Record<DialogueSceneId, DialogueSceneCast>> = {
  metroStation: {
    seatedActor: playerRef(),
    arrivingActor: roleRef('magician'),
  },
};

export interface ResolvedSceneCast {
  seated: CharacterDefinition;
  arriving: CharacterDefinition;
}

/** The reference a line speaks through: its own, else the script's default. */
export function getSpeakerRef(line: DialogueLine, script: DialogueScript): CharacterRef {
  const ref = line.speaker ?? script.defaultSpeaker;
  if (!ref) {
    throw new DialogueCastError(
      `Dialogue "${script.id}" has a line with no speaker and no defaultSpeaker: "${line.text.slice(0, 32)}…"`,
    );
  }
  return ref;
}

/**
 * Resolves one line's speaker.
 *
 * The displayed name prefers the line's explicit override, because the label
 * is a story decision — the opening dialogue calls its speaker "THE MAGICIAN"
 * while the character performing the role is Disus.
 */
export function resolveDialogueSpeaker(
  line: DialogueLine,
  script: DialogueScript,
): ResolvedDialogueSpeaker {
  const character = resolveCharacterRef(getSpeakerRef(line, script));
  return { character, displayName: line.speakerName ?? character.name };
}

export function resolveSceneCast(script: DialogueScript): ResolvedSceneCast {
  const cast = DIALOGUE_SCENE_CASTS[script.sceneId];
  if (!cast) {
    throw new DialogueCastError(`Dialogue scene "${script.sceneId}" has no cast configured.`);
  }
  return {
    seated: resolveCharacterRef(cast.seatedActor),
    arriving: resolveCharacterRef(cast.arrivingActor),
  };
}

/**
 * Every character this invocation of the dialogue can put on screen, with
 * duplicates collapsed.
 *
 * Used to decide what to load: only this cast, never every discovered
 * character. A character appearing as both the player and an NPC shows up
 * once, so the loader has nothing to deduplicate afterwards.
 */
export function resolveDialogueCast(script: DialogueScript): CharacterDefinition[] {
  const seen = new Map<string, CharacterDefinition>();
  const add = (character: CharacterDefinition): void => {
    if (!seen.has(character.id)) seen.set(character.id, character);
  };
  for (const line of script.lines) add(resolveDialogueSpeaker(line, script).character);
  const sceneCast = resolveSceneCast(script);
  add(sceneCast.seated);
  add(sceneCast.arriving);
  return [...seen.values()];
}

/**
 * Fails when casting has produced someone the presentation cannot draw.
 *
 * Worth doing up front rather than at the moment a portrait is needed: a role
 * can resolve to different characters depending on who the player is, so a
 * casting change can silently introduce a character with no appear animation.
 * Names the dialogue, the reference, the character and the missing capability
 * instead of substituting a placeholder.
 */
export function assertDialogueCastCapabilities(script: DialogueScript): void {
  const problems: string[] = [];
  const require = (
    character: CharacterDefinition,
    capable: boolean,
    what: string,
    where: string,
  ): void => {
    if (!capable) {
      problems.push(`${where} resolves to "${character.name}" (${character.id}), which has no ${what}`);
    }
  };

  for (const line of script.lines) {
    const { character } = resolveDialogueSpeaker(line, script);
    const ref = getSpeakerRef(line, script);
    require(
      character,
      character.capabilities.dialoguePortrait,
      'dialogue/portrait/idle.png and talk.png',
      `speaker ${describeRef(ref)}`,
    );
  }

  const cast = resolveSceneCast(script);
  const sceneRefs = DIALOGUE_SCENE_CASTS[script.sceneId];
  require(
    cast.seated,
    cast.seated.capabilities.metroActor,
    'dialogue/poses/metro_sit.png',
    `seated actor ${describeRef(sceneRefs.seatedActor)}`,
  );
  const arrivingWhere = `arriving actor ${describeRef(sceneRefs.arrivingActor)}`;
  require(
    cast.arriving,
    cast.arriving.capabilities.appearAnimation,
    'dialogue/appear/*.png',
    arrivingWhere,
  );
  // The entrance leaves the actor standing there for the rest of the scene,
  // so it needs a pose to settle on. An appear frame is not a substitute:
  // those are mid-materialisation poses and only the last happens to look
  // settled for the character that exists today.
  require(
    cast.arriving,
    Boolean(cast.arriving.gameplay.idle),
    'gameplay/idle.png to settle on after its entrance',
    arrivingWhere,
  );

  if (problems.length > 0) {
    throw new DialogueCastError(
      `Dialogue "${script.id}" cannot be staged:\n  - ${[...new Set(problems)].join('\n  - ')}`,
    );
  }
}

function describeRef(ref: CharacterRef): string {
  switch (ref.type) {
    case 'player':
      return '{ player }';
    case 'role':
      return `{ role: ${ref.role} }`;
    case 'character':
      return `{ character: ${ref.characterId} }`;
  }
}
