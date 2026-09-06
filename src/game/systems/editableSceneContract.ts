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
  /** Extra read-only HUD lines, for a tunable value with no world-space handle of its own. */
  describeEditor?(): string[];
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Combines every payload that targets the same route into one, so one P save
 * can never fire concurrent POSTs at the same save endpoint.
 *
 * The dev save server reads the target file, merges the incoming slice in,
 * and writes it back — one request at a time, on its own. Two concurrent
 * requests to the same route each read the file before either has written,
 * so whichever finishes last overwrites the other's change with a copy that
 * never saw it. A scene with several editable slices of the same file (the
 * boss's own presentation plus its active telegraph's emerald layout, or —
 * during the final dialogue — those two plus DialogueScene's own framing
 * slice) all reach `/__scene-editor/save-layout` this way; merging them into
 * one request before ever calling `fetch` removes the race outright rather
 * than trying to win it.
 *
 * Bodies are shallow-merged left to right when both are plain objects, which
 * is safe here because every caller's body for a mergeable route is
 * `{ [ownSceneKey]: {...} }` — distinct scene keys never collide. A route
 * that only ever sends one payload (`/__club-editor/save-npcs`, say) or
 * whose body isn't a plain object is unaffected: the last (only) payload for
 * that route wins, exactly as a single payload always did.
 */
export function mergeSavePayloadsByRoute(
  payloads: readonly EditorSavePayload[],
): readonly EditorSavePayload[] {
  const byRoute = new Map<string, EditorSavePayload>();
  for (const payload of payloads) {
    const existing = byRoute.get(payload.route);
    if (!existing) {
      byRoute.set(payload.route, payload);
      continue;
    }
    const body =
      isPlainObject(existing.body) && isPlainObject(payload.body)
        ? { ...existing.body, ...payload.body }
        : payload.body;
    byRoute.set(payload.route, { route: payload.route, body });
  }
  return [...byRoute.values()];
}
