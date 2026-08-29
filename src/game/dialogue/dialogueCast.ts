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
  toilet: {
    seatedActor: playerRef(),
    arrivingActor: roleRef('magician'),
  },
};

export interface ResolvedSceneCast {
  seated: CharacterDefinition;
  arriving: CharacterDefinition;
}

/** A drawing capability one of the two cast slots can be required to have. */
type DialogueActorCapability = 'metroPose' | 'appearAnimation' | 'standingPose';

const ACTOR_CAPABILITIES: Readonly<
  Record<DialogueActorCapability, { has: (character: CharacterDefinition) => boolean; what: string }>
> = {
  metroPose: {
    has: (character) => character.capabilities.metroActor,
    what: 'dialogue/poses/metro_sit.png',
  },
  appearAnimation: {
    has: (character) => character.capabilities.appearAnimation,
    what: 'dialogue/appear/*.png',
  },
  // The entrance leaves the actor standing there for the rest of the scene, so
  // it needs a pose to settle on. An appear frame is not a substitute: those
  // are mid-materialisation poses and only the last happens to look settled
  // for the character that exists today.
  standingPose: {
    has: (character) => Boolean(character.gameplay.idle),
    what: 'gameplay/idle.png to stand in the scene',
  },
};

/**
 * What each dialogue scene's renderer actually draws of its cast, and
 * therefore what casting has to guarantee for it.
 *
 * Per scene rather than global because the two views stage their actors
 * differently: `StationSceneView` seats one on the platform and materialises
 * the other, so it needs the metro pose and the appear frames, while
 * `ToiletSceneView` simply stands both on the floor from their gameplay idle
 * and plays no entrance at all. Asserting the station's needs everywhere
 * rejected every playable character from the toilet scene — none of them have
 * an appear animation — for capabilities that scene never draws.
 */
export const DIALOGUE_SCENE_ACTOR_CAPABILITIES: Readonly<
  Record<
    DialogueSceneId,
    { seated: readonly DialogueActorCapability[]; arriving: readonly DialogueActorCapability[] }
  >
> = {
  metroStation: { seated: ['metroPose'], arriving: ['appearAnimation', 'standingPose'] },
  toilet: { seated: ['standingPose'], arriving: ['standingPose'] },
};

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

export function resolveSceneCast(
  script: DialogueScript,
  override?: DialogueSceneCast,
): ResolvedSceneCast {
  const cast = override ?? DIALOGUE_SCENE_CASTS[script.sceneId];
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
export function resolveDialogueCast(
  script: DialogueScript,
  override?: DialogueSceneCast,
): CharacterDefinition[] {
  const seen = new Map<string, CharacterDefinition>();
  const add = (character: CharacterDefinition): void => {
    if (!seen.has(character.id)) seen.set(character.id, character);
  };
  for (const line of script.lines) add(resolveDialogueSpeaker(line, script).character);
  const sceneCast = resolveSceneCast(script, override);
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
export function assertDialogueCastCapabilities(
  script: DialogueScript,
  override?: DialogueSceneCast,
): void {
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

  const cast = resolveSceneCast(script, override);
  const sceneRefs = override ?? DIALOGUE_SCENE_CASTS[script.sceneId];
  const needed = DIALOGUE_SCENE_ACTOR_CAPABILITIES[script.sceneId];
  const slots = [
    { label: 'seated actor', character: cast.seated, ref: sceneRefs.seatedActor, needs: needed.seated },
    {
      label: 'arriving actor',
      character: cast.arriving,
      ref: sceneRefs.arrivingActor,
      needs: needed.arriving,
    },
  ] as const;
  for (const slot of slots) {
    for (const capability of slot.needs) {
      const { has, what } = ACTOR_CAPABILITIES[capability];
      require(slot.character, has(slot.character), what, `${slot.label} ${describeRef(slot.ref)}`);
    }
  }

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
