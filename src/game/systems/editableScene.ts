import Phaser from 'phaser';
import { SceneEditor } from './SceneEditor';

import { isEditableScene, toSavePayloads, type EditableScene } from './editableSceneContract';

export {
  isEditableScene,
  toSavePayloads,
  type EditableScene,
  type EditorSavePayload,
} from './editableSceneContract';

/**
 * Binds E (toggle) for one scene and pumps the editor from its update loop.
 *
 * The editor is created lazily on the first toggle so a scene that is never
 * edited pays nothing, and every listener is torn down on shutdown.
 */
function attachSceneEditor(scene: Phaser.Scene & EditableScene): void {
  const keyboard = scene.input.keyboard;
  if (!keyboard) return;
  const toggleKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  let editor: SceneEditor | undefined;

  const ensureEditor = (): SceneEditor => {
    editor ??= new SceneEditor(scene, {
      onSave: (snapshot) => {
        for (const payload of toSavePayloads(scene.buildEditorSave?.(snapshot))) {
          void fetch(payload.route, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload.body),
          }).catch((error: unknown) => {
            console.error(`[scene-editor] failed to save ${payload.route}`, error);
          });
        }
      },
      onEnable: () => scene.onEditorEnable?.(),
      onDisable: () => scene.onEditorDisable?.(),
    });
    return editor;
  };

  const onUpdate = (): void => {
    if (Phaser.Input.Keyboard.JustDown(toggleKey)) {
      const active = ensureEditor();
      // Re-registered on every toggle so a scene that has rebuilt its contents
      // since the last edit exposes the objects that exist now.
      if (!active.active) for (const object of scene.getEditableObjects()) active.register(object);
      active.toggle();
    }
    editor?.update();
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    editor = undefined;
  });
}

/**
 * Watches every scene the game has registered and attaches the editor to each
 * one that implements `EditableScene`, as it is created.
 *
 * Capability-based on purpose: there is no list of scene keys to keep in sync,
 * so a level added tomorrow is covered the moment it implements the interface.
 * Dev-only — production never calls this, so the editor's keys and pointer
 * handlers cannot reach a shipped build.
 */
export function installSceneEditors(game: Phaser.Game): void {
  if (!import.meta.env.DEV) return;
  for (const scene of game.scene.scenes) {
    if (!isEditableScene(scene)) continue;
    const editable = scene as Phaser.Scene & EditableScene;
    let attached = false;
    // Wired from the scene's first update rather than its CREATE event: a
    // scene started from another scene has already emitted CREATE by the time
    // anything outside it can listen, whereas UPDATE is guaranteed to arrive
    // for every run — including after a restart, which is what the flag and
    // the SHUTDOWN reset below are for.
    const wire = (): void => {
      if (attached) return;
      attached = true;
      attachSceneEditor(editable);
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, wire);
    scene.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      attached = false;
    });
  }
}
