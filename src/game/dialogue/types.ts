/** Inter-level dialogue domain types. Free of Phaser so timing stays testable. */
import type { CharacterRef } from '../characters/characterRef';

/** One dialogue line. Newlines are preserved as written. */
export interface DialogueLine {
  text: string;
  /** Optional per-line override of the automatic hold, in milliseconds. */
  holdMsOverride?: number;
  /**
   * Who is speaking: the selected player, a story role, or one named
   * character. Omitted lines fall back to the script's `defaultSpeaker`.
   *
   * A reference rather than a name, so a line can mean "whoever the player
   * picked" and a role can be recast without touching the content.
   */
  speaker?: CharacterRef;
  /**
   * Overrides the displayed speaker name for just this line (e.g. keeping
   * "THE MAGICIAN" as the label while the portrait itself is Disus).
   * Falls back to the portrait config's own name, then the script's default.
   *
   * Independent of `speaker`: the label is a story decision and does not have
   * to match whoever was cast.
   */
  speakerName?: string;
}

/** Which prebuilt left-hand scene a dialogue plays over. */
export type DialogueSceneId = 'metroStation';

export interface DialogueScript {
  id: string;
  sceneId: DialogueSceneId;
  /** Speaker for any line that does not set its own `speaker`. */
  defaultSpeaker: CharacterRef;
  lines: readonly DialogueLine[];
  /** Scene started once the dialogue finishes or is skipped. */
  nextScene: string;
}
