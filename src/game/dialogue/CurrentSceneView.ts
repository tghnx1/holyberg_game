import type Phaser from 'phaser';
import type { EditableObject } from '../systems/SceneEditor';
import type { EditorSavePayload } from '../systems/editableSceneContract';
import { DialogueStageViewport } from './DialogueStageViewport';
import type { CurrentSceneLiveActor, LiveStageTarget } from './currentSceneLiveStage';
import { buildLiveActorEditable } from './currentSceneLiveActorProxy';
import {
  releaseCurrentSceneSnapshot,
  type CurrentSceneSnapshot,
} from './currentSceneSnapshot';

/** Displays one real gameplay frame through the existing dialogue viewport. */
export class CurrentSceneView {
  private readonly viewport: DialogueStageViewport;
  private readonly image: Phaser.GameObjects.Image;
  private readonly actors: { definition: CurrentSceneLiveActor; target: LiveStageTarget }[];

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
    private readonly snapshot: CurrentSceneSnapshot,
    framingWidth = width,
  ) {
    this.viewport = new DialogueStageViewport(scene, {
      layoutId: snapshot.layoutId,
      label: 'CURRENT SCENE DIALOGUE STAGE',
      canonicalWidth: snapshot.width,
      canonicalHeight: snapshot.height,
    });
    this.image = scene.add
      .image(0, 0, snapshot.textureKey)
      .setOrigin(0, 0)
      .setDisplaySize(snapshot.width, snapshot.height);
    this.viewport.add([this.image]);
    this.actors = (snapshot.liveStage?.actors ?? []).map((definition) => {
      const target = definition.create(scene);
      this.viewport.add([target]);
      return { definition, target };
    });
    this.resize(width, height, framingWidth);
  }

  get root(): Phaser.GameObjects.Container {
    return this.viewport.root;
  }

  resize(width: number, height: number, framingWidth = width): void {
    this.viewport.resize(width, height, framingWidth);
  }

  /**
   * Most current-scene dialogues have nothing to animate in, so the default
   * is the fixed short delay this always was. A stage that needs a real
   * entrance (e.g. a character appearing) provides its own `playArrival` and
   * owns calling `onComplete` when it's actually done.
   */
  playArrival(onComplete: () => void): void {
    const arrival = this.snapshot.liveStage?.playArrival;
    if (arrival) {
      arrival(onComplete);
      return;
    }
    this.scene.time.delayedCall(120, onComplete);
  }

  getEditableObjects(): EditableObject[] {
    return [
      this.viewport.getEditableObject(),
      ...this.actors.map(({ definition, target }) => buildLiveActorEditable(definition, target)),
    ];
  }

  update(now: number): void {
    for (const actor of this.actors) actor.definition.update?.(actor.target, now);
  }

  buildEditorSave():
    | EditorSavePayload
    | readonly EditorSavePayload[]
    | undefined {
    return this.snapshot.liveStage?.buildEditorSave?.();
  }

  destroy(): void {
    this.viewport.destroy();
    releaseCurrentSceneSnapshot(this.scene.textures, this.snapshot);
  }
}
