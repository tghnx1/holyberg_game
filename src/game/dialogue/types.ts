/** Inter-level dialogue domain types. Free of Phaser so timing stays testable. */

/** One dialogue line. Newlines are preserved as written. */
export interface DialogueLine {
  text: string;
  /** Optional per-line override of the automatic hold, in milliseconds. */
  holdMsOverride?: number;
}

/** Which prebuilt left-hand scene a dialogue plays over. */
export type DialogueSceneId = 'metroStation';

/** Which prebuilt portrait fills the right-hand panel. */
export type DialoguePortraitId = 'magician';

export interface DialogueScript {
  id: string;
  sceneId: DialogueSceneId;
  portraitId: DialoguePortraitId;
  /** Name shown above the dialogue text. */
  speaker: string;
  lines: readonly DialogueLine[];
  /** Scene started once the dialogue finishes or is skipped. */
  nextScene: string;
}
