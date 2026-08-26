/**
 * Inter-level dialogue content.
 *
 * Pure data: adding a new dialogue means adding an entry here and starting
 * DialogueScene with its id. Nothing in this file knows how anything is drawn.
 */
import { characterRef, playerRef, roleRef } from '../characters/characterRef';
import type { DialogueScript } from './types';

export const METRO_MAGICIAN_DIALOGUE: DialogueScript = {
  id: 'metro-magician',
  sceneId: 'metroStation',
  // The Magician is a role, so the pairing flips if the player is ever Disus.
  // The second line is the *player* speaking rather than Atmos specifically,
  // so it picks up whichever character was selected — including their name,
  // since it carries no speakerName override.
  defaultSpeaker: roleRef('magician'),
  lines: [
    { text: 'I KNOW YOU!', speaker: roleRef('magician'), speakerName: 'THE MAGICIAN' },
    { text: "YOU'RE NOT FROM THIS WORLD.\nLITERALLY.", speaker: playerRef() },
    {
      text: "I CAN OPEN YOU A PORTAL HOME,\nBUT YOU NEED TO PROVE YOU'RE\nCOOL ENOUGH FOR IT.",
      speaker: roleRef('magician'),
      speakerName: 'THE MAGICIAN',
    },
    // The closing beat lands harder with a longer hold than its length earns.
    {
      text: 'LOCK IT IN:\nMADAME CLAUDE\n9 OCTOBER\n22:00',
      holdMsOverride: 1400,
      speaker: roleRef('magician'),
      speakerName: 'THE MAGICIAN',
    },
  ],
  nextScene: 'BerlinScene',
};

/**
 * Dev-only script for exercising portrait switching
 * (`?scene=dialogue&script=player-magician-test`). Alternates the player with
 * the Magician role, which is the switching case production relies on.
 */
export const PLAYER_MAGICIAN_TEST_DIALOGUE: DialogueScript = {
  id: 'player-magician-test',
  sceneId: 'metroStation',
  defaultSpeaker: playerRef(),
  lines: [
    { text: "HEY, YOU SEEING\nTHIS TRAIN?", speaker: playerRef() },
    { text: 'YEAH. WE SHOULD\nPROBABLY RUN.', speaker: roleRef('magician') },
    { text: "GIVE ME A SECOND,\nI'M TALKING.", speaker: playerRef() },
    // An explicit character is never recast, unlike the role above.
    { text: 'THAT WAS NOT\nA SECOND.', speaker: characterRef('disus'), speakerName: 'DISUS' },
  ],
  nextScene: 'BerlinScene',
};

export const DIALOGUE_SCRIPTS: Record<string, DialogueScript> = {
  [METRO_MAGICIAN_DIALOGUE.id]: METRO_MAGICIAN_DIALOGUE,
  [PLAYER_MAGICIAN_TEST_DIALOGUE.id]: PLAYER_MAGICIAN_TEST_DIALOGUE,
};

export const getDialogueScript = (id: string): DialogueScript | undefined =>
  DIALOGUE_SCRIPTS[id];
