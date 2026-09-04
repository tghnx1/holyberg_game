import type { CharacterDefinition } from '../../characters/characterManifest';
import { characterRef } from '../../characters/characterRef';
import { getCharacter, getPlayableCharacters } from '../../characters/characterRegistry';
import { getSelectedCharacter } from '../../characters/characterSelection';
import { resolveCharacterRole } from '../../characters/characterRef';
import type { DialogueScript } from '../../dialogue/types';

export type ClubStorySlot = 'dj1' | 'barkeeper' | 'dj3';

export interface ClubStoryCast {
  dj1Id: string;
  barkeeperId: string;
  dj3Id: string;
}

export interface ClubStoryPlacement {
  roomId: string;
  layoutId: string;
  xRatio: number;
  baselineRatio: number;
  scale: number;
  /** Portion of the actor body visible above an authored counter. */
  waistCrop?: boolean;
}

export const CLUB_STORY_PLACEMENTS: Readonly<Record<ClubStorySlot, ClubStoryPlacement>> = {
  dj1: {
    roomId: 'lounge',
    layoutId: 'club-story-dj-1',
    xRatio: 0.62,
    baselineRatio: 0.955,
    scale: 1.2,
  },
  barkeeper: {
    roomId: 'corridor',
    layoutId: 'club-story-barkeeper',
    xRatio: 0.79,
    baselineRatio: 0.87,
    scale: 1.28,
    waistCrop: true,
  },
  dj3: {
    roomId: 'dancefloor',
    layoutId: 'club-story-dj-3',
    xRatio: 0.78,
    baselineRatio: 0.76,
    scale: 1.24,
  },
};

export class ClubStoryCastingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClubStoryCastingError';
  }
}

/**
 * Resolves all three Club performers once. The non-Magician pool wins when
 * it can fill every slot; otherwise the role performer is used only as the
 * last available distinct character.
 */
export function resolveClubStoryCast(
  selected: CharacterDefinition = getSelectedCharacter(),
  playable: readonly CharacterDefinition[] = getPlayableCharacters(),
  magician: CharacterDefinition = resolveCharacterRole('magician'),
): ClubStoryCast {
  const available = playable.filter((character) => character.id !== selected.id);
  if (available.length < 3) {
    throw new ClubStoryCastingError(
      `Club story needs three distinct playable NPCs in addition to player "${selected.id}", ` +
        `but only ${available.length} are available.`,
    );
  }
  const preferred = available.filter((character) => character.id !== magician.id);
  const ordered = preferred.length >= 3
    ? preferred
    : [...preferred, ...available.filter((character) => character.id === magician.id)];
  const [dj1, barkeeper, dj3] = ordered;
  return { dj1Id: dj1.id, barkeeperId: barkeeper.id, dj3Id: dj3.id };
}

export function characterForClubStorySlot(
  cast: ClubStoryCast,
  slot: ClubStorySlot,
): CharacterDefinition {
  const id = slot === 'dj1' ? cast.dj1Id : slot === 'barkeeper' ? cast.barkeeperId : cast.dj3Id;
  return getCharacter(id);
}

export function clubStorySlotForRoom(roomId: string): ClubStorySlot | undefined {
  return (Object.entries(CLUB_STORY_PLACEMENTS) as [ClubStorySlot, ClubStoryPlacement][])
    .find(([, placement]) => placement.roomId === roomId)?.[0];
}

export function buildClubRoomDialogue(
  slot: ClubStorySlot,
  characterId: string,
): DialogueScript {
  const common = {
    sceneId: 'currentScene' as const,
    defaultSpeaker: characterRef(characterId),
    nextScene: 'ClubScene',
    title: 'MADAME CLAUDE',
  };
  switch (slot) {
    case 'dj1':
      return {
        ...common,
        id: 'club-lounge-dj',
        lines: [{
          text: 'Portal? No idea. Maybe they pour that at the bar too.',
          speakerName: '',
        }],
      };
    case 'barkeeper':
      return {
        ...common,
        id: 'club-barkeeper',
        lines: [{
          text: "Some DJ wouldn't shut up about a portal. He's behind the decks. Go ask him — if he ever stops.",
          speakerName: 'BARKEEPER',
        }],
      };
    case 'dj3':
      return {
        ...common,
        id: 'club-dancefloor-dj',
        lines: [{
          text: "Are you ready? Doesn't matter, there's no second run. Mix!",
          speakerName: 'DJ',
        }],
      };
  }
}

export function buildPostRhythmDialogue(characterId: string): DialogueScript {
  return {
    id: 'club-post-rhythm-dj',
    sceneId: 'currentScene',
    title: 'MADAME CLAUDE — AFTER THE SET',
    defaultSpeaker: characterRef(characterId),
    lines: [{
      text: "That was nasty. Portal's in the toilet, by the way. Where else would it be?",
      speakerName: 'DJ',
    }],
    nextScene: 'Level4Scene',
  };
}
