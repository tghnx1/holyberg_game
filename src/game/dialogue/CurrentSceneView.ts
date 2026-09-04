import type Phaser from 'phaser';
import type { EditableObject } from '../systems/SceneEditor';
import { DialogueStageViewport } from './DialogueStageViewport';
import {
  releaseCurrentSceneSnapshot,
  type CurrentSceneSnapshot,
} from './currentSceneSnapshot';

/** Displays one real gameplay frame through the existing dialogue viewport. */
export class CurrentSceneView {
  private readonly viewport: DialogueStageViewport;
  private readonly image: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
    private readonly snapshot: CurrentSceneSnapshot,
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
    this.resize(width, height);
  }

  get root(): Phaser.GameObjects.Container {
    return this.viewport.root;
  }

  resize(width: number, height: number): void {
    this.viewport.resize(width, height);
  }

  playArrival(onComplete: () => void): void {
    this.scene.time.delayedCall(120, onComplete);
  }

  getEditableObjects(): EditableObject[] {
    return [this.viewport.getEditableObject()];
  }

  destroy(): void {
    this.viewport.destroy();
    releaseCurrentSceneSnapshot(this.scene.textures, this.snapshot);
  }
}
