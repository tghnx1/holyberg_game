import type Phaser from 'phaser';
import type { DialogueScript } from './types';

/** One frozen frame handed from gameplay into the shared dialogue stage. */
export interface CurrentSceneSnapshot {
  textureKey: string;
  width: number;
  height: number;
  /** Distinct editor id, so each conversation keeps its own authored framing. */
  layoutId: string;
}

let snapshotSerial = 0;

/**
 * Captures the renderer after the current frame has been presented.
 *
 * The source scene remains the authority for the composition: videos,
 * backgrounds, actors, authored transforms and camera framing are captured
 * together. Nothing is rebuilt inside DialogueScene.
 */
export function captureCurrentSceneSnapshot(
  scene: Phaser.Scene,
  layoutId: string,
): Promise<CurrentSceneSnapshot> {
  const textureKey = `dialogue-current-scene-${scene.scene.key}-${snapshotSerial += 1}`;
  return new Promise((resolve, reject) => {
    scene.game.renderer.snapshot((result) => {
      if (!(result instanceof HTMLImageElement)) {
        reject(new Error(`Could not capture ${scene.scene.key}: renderer returned a pixel sample.`));
        return;
      }
      scene.textures.remove(textureKey);
      const texture = scene.textures.addImage(textureKey, result);
      if (!texture) {
        reject(new Error(`Could not register dialogue snapshot texture "${textureKey}".`));
        return;
      }
      resolve({
        textureKey,
        width: scene.cameras.main.width,
        height: scene.cameras.main.height,
        layoutId,
      });
    }, 'image/png');
  });
}

export function releaseCurrentSceneSnapshot(
  textures: Phaser.Textures.TextureManager,
  snapshot: CurrentSceneSnapshot | undefined,
): void {
  if (snapshot && textures.exists(snapshot.textureKey)) textures.remove(snapshot.textureKey);
}

export interface CurrentSceneDialogueRequest {
  script: DialogueScript;
  payload?: Record<string, unknown>;
  resumeEvent: string;
  resumePayload?: Record<string, unknown>;
}

/** Capture, pause, and launch the existing reusable DialogueScene over it. */
export async function launchCurrentSceneDialogue(
  scene: Phaser.Scene,
  request: CurrentSceneDialogueRequest,
): Promise<void> {
  const snapshot = await captureCurrentSceneSnapshot(
    scene,
    `current-scene-${request.script.id}`,
  );
  const sourceSceneKey = scene.scene.key;
  scene.scene.pause(sourceSceneKey);
  scene.scene.launch('DialogueScene', {
    script: request.script,
    payload: request.payload,
    stageSnapshot: snapshot,
    resume: {
      sceneKey: sourceSceneKey,
      event: request.resumeEvent,
      payload: request.resumePayload,
    },
  });
}
