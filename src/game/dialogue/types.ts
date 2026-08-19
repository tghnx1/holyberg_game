/** Inter-level dialogue domain types. Free of Phaser so timing stays testable. */

/** One dialogue line. Newlines are preserved as written. */
export interface DialogueLine {
  text: string;
  /** Optional per-line override of the automatic hold, in milliseconds. */
  holdMsOverride?: number;
  /**
   * Overrides the script's own `portraitId`/`speaker` for just this line.
   * Lets one script alternate between speakers (e.g. Atmos and Disus taking
   * turns) without every dialogue needing to declare a fixed single speaker.
   * Omitted lines fall back to the script's defaults, so existing scripts
   * that never set this are completely unaffected.
   */
  speakerId?: DialoguePortraitId;
  /**
   * Overrides the displayed speaker name for just this line (e.g. keeping
   * "THE MAGICIAN" as the label while the portrait itself is Disus).
   * Falls back to the portrait config's own name, then the script's default.
   */
  speakerName?: string;
}

/** Which prebuilt left-hand scene a dialogue plays over. */
export type DialogueSceneId = 'metroStation';

/**
 * Which prebuilt portrait fills the right-hand panel. 'magician' is the
 * hand-drawn placeholder portrait (MagicianPortrait); every other id must
 * have a matching entry in speakerPortraits.ts and renders as a 2-frame
 * talking portrait (TalkingPortrait) instead.
 */
export type DialoguePortraitId = 'magician' | 'atmos' | 'disus';

export interface DialogueScript {
  id: string;
  sceneId: DialogueSceneId;
  /** Default portrait/speaker for any line that doesn't set its own `speakerId`. */
  portraitId: DialoguePortraitId;
  /** Default name shown above the dialogue text. */
  speaker: string;
  lines: readonly DialogueLine[];
  /** Scene started once the dialogue finishes or is skipped. */
  nextScene: string;
}
