/**
 * Inter-level dialogue content.
 *
 * Pure data: adding a new dialogue means adding an entry here and starting
 * DialogueScene with its id. Nothing in this file knows how anything is drawn.
 */
import { characterRef, playerRef, roleRef } from '../characters/characterRef';
import type { DialogueScript } from './types';

export const METRO_DISUS_DIALOGUE: DialogueScript = {
  id: 'metro-disus',
  sceneId: 'metroStation',
  // Disus is a role, so the pairing flips if the player is ever Disus.
  // The second line is the *player* speaking rather than Atmos specifically,
  // so it picks up whichever character was selected — including their name,
  // since it carries no speakerName override.
  defaultSpeaker: roleRef('disus'),
 lines: [
  {
    text: 'NOW, YOU THERE!',
    speaker: roleRef('disus'),
    speakerName: 'DISUS',
  },
  {
    text: "YOU'RE A STRANGER\nIN THIS WORLD.",
    speaker: roleRef('disus'),
    speakerName: 'DISUS',
  },
  {
    text: 'A PORTAL HOME WILL BE\nWAITING FOR YOU\nAT MADAME CLAUDE.\n\n9 OCTOBER\n22:00',
    speaker: roleRef('disus'),
    speakerName: 'DISUS',
  },
  // The closing beat lands harder with a longer hold than its length earns.
  {
    text: 'BUT FIRST, PROVE TO ME\nTHAT YOU DESERVE IT.',
    holdMsOverride: 1400,
    speaker: roleRef('disus'),
    speakerName: 'DISUS',
  },
],
  nextScene: 'BerlinScene',
};

/**
 * Dev-only script for exercising portrait switching
 * (`?scene=dialogue&script=player-disus-test`). Alternates the player with
 * the Disus role, which is the switching case production relies on.
 */
export const PLAYER_DISUS_TEST_DIALOGUE: DialogueScript = {
  id: 'player-disus-test',
  sceneId: 'metroStation',
  defaultSpeaker: playerRef(),
  lines: [
    { text: "HEY, YOU SEEING\nTHIS TRAIN?", speaker: playerRef() },
    { text: 'YEAH. WE SHOULD\nPROBABLY RUN.', speaker: roleRef('disus') },
    { text: "GIVE ME A SECOND,\nI'M TALKING.", speaker: playerRef() },
    // An explicit character is never recast, unlike the role above.
    { text: 'THAT WAS NOT\nA SECOND.', speaker: characterRef('disus'), speakerName: 'DISUS' },
  ],
  nextScene: 'BerlinScene',
};

export const DIALOGUE_SCRIPTS: Record<string, DialogueScript> = {
  [METRO_DISUS_DIALOGUE.id]: METRO_DISUS_DIALOGUE,
  [PLAYER_DISUS_TEST_DIALOGUE.id]: PLAYER_DISUS_TEST_DIALOGUE,
};

export const getDialogueScript = (id: string): DialogueScript | undefined =>
  DIALOGUE_SCRIPTS[id];
