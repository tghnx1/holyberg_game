import type { EditableObject, EditableSnapshot } from './SceneEditor';

/**
 * The contract a scene implements to become editable, kept free of Phaser so
 * the opt-in rule and the save fan-out are testable without a browser — the
 * same split `dialogueCast` and `sceneEditorCoords` already use.
 *
 * A scene opts in purely by *having* these methods. There is no registry of
 * scene keys anywhere, so adding a level is enough to get the editor:
 *
 * ```text
 * scene implements EditableScene
 *         v
 * installSceneEditors (capability check, dev only)
 *         v
 * SceneEditor  ->  buildEditorSave  ->  validated save route
 * ```
 */
export interface EditableScene {
  /**
   * Everything the editor may manipulate in this scene right now. Called on
   * every toggle, so a scene whose contents change (a club room's crowd, a
   * level's streamed chunk) can return a different set each time.
   */
  getEditableObjects(): EditableObject[];
  /**
   * Turns the current snapshot into one or more payloads for the validated
   * save routes. A scene that owns several kinds of editable data (a crowd
   * *and* the player's visual placement, say) returns one payload per target.
   * Returning nothing means there is nothing to persist yet.
   */
  buildEditorSave?(
    snapshot: EditableSnapshot[],
  ): EditorSavePayload | readonly EditorSavePayload[] | undefined;
  /** Freeze/resume any time-based progression while the editor is open. */
  onEditorEnable?(): void;
  onEditorDisable?(): void;
}

export interface EditorSavePayload {
  /** One of the routes registered in `EDITOR_SAVE_TARGETS` (vite.config.ts). */
  route: string;
  body: unknown;
}

/**
 * The whole opt-in check. A scene is editable because it *has* the method, not
 * because its key appears on any list — which is what lets a level added later
 * gain the editor without touching the installer.
 */
export function isEditableScene(scene: object): scene is EditableScene {
  return typeof (scene as Partial<EditableScene>).getEditableObjects === 'function';
}

/** Normalises `buildEditorSave`'s return into the list of posts to make. */
export function toSavePayloads(
  result: EditorSavePayload | readonly EditorSavePayload[] | undefined,
): readonly EditorSavePayload[] {
  if (!result) return [];
  return Array.isArray(result) ? result : [result as EditorSavePayload];
}
