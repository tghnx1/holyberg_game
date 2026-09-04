import type Phaser from 'phaser';
import { SceneEditorCore } from './editor/SceneEditorCore';
import {
  toEditableItem,
  transformOf,
  type EditableObject,
  type EditableSnapshot,
} from './editor/transformItem';

export type {
  EditableObject,
  EditableSnapshot,
  EditableTransform,
  EditableTarget,
} from './editor/transformItem';

/**
 * The transform-backed front end onto the shared editor core, used by
 * ClubScene, Level4Scene and DialogueScene.
 *
 * This is now a thin adapter rather than an editor of its own: selection,
 * drag, resize, keyboard controls, copy/paste, outlines, handles, camera
 * pan/zoom and the on/off lifecycle all live in `SceneEditorCore`, shared
 * with Berlin's `LevelEditorSystem`. What stays here is only the translation
 * between a scene's `EditableObject` records and the core's world-space
 * `EditableItem` contract (see `transformItem.ts`), plus the save fan-out
 * that hands a scene its own snapshot back.
 *
 * Registering an object with a `clone` gives it copy/paste; leaving that off
 * — as Level 4's single toilet backdrop and every scene's main player do —
 * is what keeps duplication away from objects it makes no sense for.
 */
export interface SceneEditorOptions {
  /**
   * Called when the user presses P while the editor is active. May return a
   * promise; the "LAYOUT SAVED" toast waits for it, so it only appears once
   * the save has actually completed rather than the instant P is pressed.
   */
  onSave?: (snapshot: EditableSnapshot[]) => void | Promise<void>;
  /** Camera the editor pans/zooms; omit to disable that behaviour. Defaults to scene.cameras.main. */
  camera?: Phaser.Cameras.Scene2D.Camera | null;
  /**
   * Called right after E turns the editor on/off. Scenes with their own time-
   * based progression (tweens, delayed calls, a hand-rolled state machine
   * driven by `scene.time.now`) can use these to pause/resume that
   * progression while editing, so an object's own selection/drag/resize/
   * nudge/save inside the editor is never affected by the host scene being
   * paused — those keep working purely off pointer/keyboard input, not the
   * scene clock. See DialogueScene for a worked example.
   */
  onEnable?: () => void;
  onDisable?: () => void;
  /** Extra HUD lines under the shortcut list, for a value with no world-space handle of its own. */
  describe?: () => string[];
}

export class SceneEditor {
  private readonly core: SceneEditorCore;
  private readonly objects = new Map<string, EditableObject>();

  constructor(scene: Phaser.Scene, options: SceneEditorOptions = {}) {
    this.core = new SceneEditorCore(scene, {
      camera: options.camera,
      onEnable: options.onEnable,
      onDisable: options.onDisable,
      describe: options.describe,
      title: 'SCENE EDITOR  —  E exit   P save',
      onSave: () => {
        void Promise.resolve(options.onSave?.(this.getSnapshot()))
          .then(() => this.core.flash('LAYOUT SAVED'))
          .catch((error: unknown) => {
            console.error('[scene-editor] save failed', error);
            this.core.flash('SAVE FAILED');
          });
      },
    });
    scene.events.once('shutdown', () => this.destroy());
  }

  get active(): boolean {
    return this.core.active;
  }

  register(object: EditableObject): void {
    // The core removes its EditableItem after Delete; mirror that removal in
    // this transform registry so the snapshot handed to P cannot resurrect a
    // deleted clone in scene-specific serializers.
    const registered = object.remove
      ? {
          ...object,
          remove: () => {
            object.remove?.();
            this.objects.delete(object.id);
          },
        }
      : object;
    this.objects.set(registered.id, registered);
    this.core.register(
      // A clone registers itself the same way, so a pasted copy is selectable
      // and saved without the scene re-declaring its objects.
      toEditableItem(registered, (created) => {
        this.register(created);
        return created.id;
      }),
    );
  }

  unregister(id: string): void {
    this.objects.delete(id);
    this.core.unregister(id);
  }

  toggle(): void {
    this.core.toggle();
  }

  update(): void {
    this.core.update();
  }

  /** Every registered object's current transform, in registration order. */
  getSnapshot(): EditableSnapshot[] {
    return [...this.objects.values()].map((object) => ({
      id: object.id,
      ...transformOf(object),
    }));
  }

  destroy(): void {
    this.core.destroy();
  }
}
