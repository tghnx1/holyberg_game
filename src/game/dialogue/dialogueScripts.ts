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
  portraitId: 'magician',
  speaker: 'THE MAGICIAN',
  lines: [
    { text: 'I KNOW YOU!' },
    { text: "YOU'RE NOT FROM THIS WORLD.\nLITERALLY." },
    {
      text: "I CAN OPEN YOU A PORTAL HOME,\nBUT YOU NEED TO PROVE YOU'RE\nCOOL ENOUGH FOR IT.",
    },
    { text: 'LOCK IT IN:' },
    // The closing beat lands harder with a longer hold than its length earns.
    { text: 'PLACE.\nDATE.\nTIME.', holdMsOverride: 1400 },
  ],
  nextScene: 'BerlinScene',
};

export const DIALOGUE_SCRIPTS: Record<string, DialogueScript> = {
  [METRO_MAGICIAN_DIALOGUE.id]: METRO_MAGICIAN_DIALOGUE,
};

export const getDialogueScript = (id: string): DialogueScript | undefined =>
  DIALOGUE_SCRIPTS[id];
