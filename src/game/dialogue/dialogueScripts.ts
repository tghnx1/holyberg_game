/**
 * Inter-level dialogue content.
 *
 * Pure data: adding a new dialogue means adding an entry here and starting
 * DialogueScene with its id. Nothing in this file knows how anything is drawn.
 */
import type { DialogueScript } from './types';

export const METRO_MAGICIAN_DIALOGUE: DialogueScript = {
  id: 'metro-magician',
  sceneId: 'metroStation',
  portraitId: 'disus',
  speaker: 'THE MAGICIAN',
  lines: [
    { text: 'I KNOW YOU!', speakerId: 'disus', speakerName: 'THE MAGICIAN' },
    {
      text: "YOU'RE NOT FROM THIS WORLD.\nLITERALLY.",
      speakerId: 'atmos',
      speakerName: 'ATMOS',
    },
    {
      text: "I CAN OPEN YOU A PORTAL HOME,\nBUT YOU NEED TO PROVE YOU'RE\nCOOL ENOUGH FOR IT.",
      speakerId: 'disus',
      speakerName: 'THE MAGICIAN',
    },
    // The closing beat lands harder with a longer hold than its length earns.
    {
      text: 'LOCK IT IN:\nMADAME CLAUDE\n9 OCTOBER\n22:00',
      holdMsOverride: 1400,
      speakerId: 'disus',
      speakerName: 'THE MAGICIAN',
    },
  ],
  nextScene: 'BerlinScene',
};

/** Dev-only script for exercising the Atmos/Disus talking portraits (`?scene=dialogue&script=atmos-disus-test`). */
export const ATMOS_DISUS_TEST_DIALOGUE: DialogueScript = {
  id: 'atmos-disus-test',
  sceneId: 'metroStation',
  portraitId: 'atmos',
  speaker: 'ATMOS',
  lines: [
    { text: "HEY DISUS, YOU SEEING\nTHIS TRAIN?", speakerId: 'atmos' },
    { text: 'YEAH. WE SHOULD\nPROBABLY RUN.', speakerId: 'disus' },
    { text: "GIVE ME A SECOND,\nI'M TALKING.", speakerId: 'atmos' },
    { text: 'THAT WAS NOT\nA SECOND.', speakerId: 'disus' },
  ],
  nextScene: 'BerlinScene',
};

export const DIALOGUE_SCRIPTS: Record<string, DialogueScript> = {
  [METRO_MAGICIAN_DIALOGUE.id]: METRO_MAGICIAN_DIALOGUE,
  [ATMOS_DISUS_TEST_DIALOGUE.id]: ATMOS_DISUS_TEST_DIALOGUE,
};

export const getDialogueScript = (id: string): DialogueScript | undefined =>
  DIALOGUE_SCRIPTS[id];
