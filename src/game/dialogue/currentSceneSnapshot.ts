import type Phaser from 'phaser';
import { createSceneContinuation } from '../systems/sceneContinuation';
import type { DialogueScript } from './types';
import {
  isCurrentSceneDialogueSource,
  hideLiveStageSources,
  type CurrentSceneLiveStage,
} from './currentSceneLiveStage';

/** One frozen frame handed from gameplay into the shared dialogue stage. */
export interface CurrentSceneSnapshot {
  textureKey: string;
  width: number;
  height: number;
  /** Distinct editor id, so each conversation keeps its own authored framing. */
  layoutId: string;
  /** Optional real actors layered over the background-only snapshot. */
  liveStage?: CurrentSceneLiveStage;
}

let snapshotSerial = 0;
const SNAPSHOT_TIMEOUT_MS = 5000;
class SnapshotCancelledError extends Error {}

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
  liveStage?: CurrentSceneLiveStage,
): Promise<CurrentSceneSnapshot> {
  const textureKey = `dialogue-current-scene-${scene.scene.key}-${snapshotSerial += 1}`;
  const restoreLiveSources = liveStage ? hideLiveStageSources(liveStage) : undefined;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (): boolean => {
      if (settled) return false;
      settled = true;
      globalThis.clearTimeout(timeout);
      scene.events.off('shutdown', onShutdown);
      restoreLiveSources?.();
      return true;
    };
    const onShutdown = (): void => {
      if (finish()) reject(new SnapshotCancelledError('Snapshot source stopped.'));
    };
    const timeout = globalThis.setTimeout(() => {
      if (finish()) reject(new Error(`Timed out capturing ${scene.scene.key}.`));
    }, SNAPSHOT_TIMEOUT_MS);
    scene.events.once('shutdown', onShutdown);
    try {
      scene.game.renderer.snapshot((result) => {
        if (!finish()) return;
        try {
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
            liveStage,
          });
        } catch (error) {
          reject(error);
        }
      }, 'image/png');
    } catch (error) {
      if (finish()) reject(error);
    }
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
  const continuation = createSceneContinuation(scene);
  let snapshot: CurrentSceneSnapshot | undefined;
  try {
    const liveStage = isCurrentSceneDialogueSource(scene)
      ? scene.buildCurrentSceneDialogueStage()
      : undefined;
    snapshot = await captureCurrentSceneSnapshot(
      scene,
      `current-scene-${request.script.id}`,
      liveStage,
    );
    if (!await continuation.ready()) {
      releaseCurrentSceneSnapshot(scene.textures, snapshot);
      return;
    }
    const sourceSceneKey = scene.scene.key;
    const dialogueScene = scene.scene.get('DialogueScene');
    // `launch` itself is queued. Register before queuing it, then reorder from
    // CREATE when the target really exists in the active render list. Calling
    // bringToTop immediately after launch can run too early outside a Scene
    // Manager update and become a no-op.
    dialogueScene.events.once('create', () => scene.scene.bringToTop('DialogueScene'));
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
  } catch (error) {
    releaseCurrentSceneSnapshot(scene.textures, snapshot);
    if (!(error instanceof SnapshotCancelledError)) throw error;
  } finally {
    continuation.dispose();
  }
}
