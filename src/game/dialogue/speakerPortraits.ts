import {
  ATMOS_DIALOG_IDLE_KEY,
  ATMOS_DIALOG_TALK_KEY,
  DISUS_DIALOG_IDLE_KEY,
  DISUS_DIALOG_TALK_KEY,
} from './dialoguePortraitAssets';
import type { DialoguePortraitId } from './types';

/**
 * Config for a 2-frame talking portrait: which two textures to alternate
 * between and the display name shown above the dialogue text while they're
 * the active speaker.
 *
 * Adding a new talking speaker to the dialogue system is just adding an
 * entry here (plus its two texture keys/loads) — nothing dialogue-specific
 * or scene-specific required, which is what makes this reusable beyond
 * Dialogue 1.
 */
export interface SpeakerPortraitConfig {
  name: string;
  /** Frame 1: idle / closed mouth. */
  idleFrameKey: string;
  /** Frame 2: talking / open mouth. */
  talkFrameKey: string;
}

/**
 * Only speakers with a 2-frame talking portrait live here. 'magician' is
 * deliberately absent — it renders through the older MagicianPortrait
 * placeholder instead, so DialogueScene checks this map to decide which of
 * the two portrait systems a given speaker uses.
 */
export const SPEAKER_PORTRAITS: Partial<Record<DialoguePortraitId, SpeakerPortraitConfig>> = {
  atmos: {
    name: 'ATMOS',
    idleFrameKey: ATMOS_DIALOG_IDLE_KEY,
    talkFrameKey: ATMOS_DIALOG_TALK_KEY,
  },
  disus: {
    name: 'DISUS',
    idleFrameKey: DISUS_DIALOG_IDLE_KEY,
    talkFrameKey: DISUS_DIALOG_TALK_KEY,
  },
};

export function getSpeakerPortrait(id: DialoguePortraitId): SpeakerPortraitConfig | undefined {
  return SPEAKER_PORTRAITS[id];
}
