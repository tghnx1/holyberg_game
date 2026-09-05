import Phaser from 'phaser';
import { loopedFrameIndex } from '../characters/characterAnimation';
import type { EditorSavePayload } from '../systems/editableSceneContract';
import type { EditableObject, EditableTarget } from '../systems/SceneEditor';

export type LiveStageTarget = EditableTarget & Phaser.GameObjects.Components.Visible;

export interface CurrentSceneLiveActor {
  id: string;
  label: string;
  source: EditableObject;
  /** Builds the real display object owned by DialogueScene. */
  create: (scene: Phaser.Scene) => LiveStageTarget;
  /** Texture/pose-only animation; never rewrites an editor-authored transform. */
  update?: (target: LiveStageTarget, now: number) => void;
  /** Frozen camera offset needed to map stage-local screen coordinates back to world coordinates. */
  sourceScrollX: number;
  sourceScrollY: number;
}

export interface CurrentSceneLiveStage {
  actors: readonly CurrentSceneLiveActor[];
  buildEditorSave?: () => EditorSavePayload | readonly EditorSavePayload[] | undefined;
  /**
   * Optional real arrival sequence (e.g. a character walking/materializing
   * on), run once the panels have slid in and before the first line types.
   * Must call `onComplete` itself once the entrance has actually finished —
   * `CurrentSceneView.playArrival` falls back to a fixed short delay when
   * this is absent, which is unchanged behaviour for every stage that
   * doesn't provide one.
   */
  playArrival?: (onComplete: () => void) => void;
}

export interface CurrentSceneDialogueSource {
  buildCurrentSceneDialogueStage(): CurrentSceneLiveStage;
}

export function isCurrentSceneDialogueSource(scene: object): scene is CurrentSceneDialogueSource {
  return typeof (scene as Partial<CurrentSceneDialogueSource>).buildCurrentSceneDialogueStage === 'function';
}

export interface LiveSpriteOptions {
  frameKeys?: readonly string[];
  cycleMs?: number;
  phaseMs?: number;
  /** Optional source-pixel crop retained by the live clone (e.g. a bar counter). */
  crop?: { x: number; y: number; width: number; height: number };
}

/** Builds a live-stage adapter from one already-supported SceneEditor object. */
export function liveSpriteActor(
  scene: Phaser.Scene,
  source: EditableObject,
  options: LiveSpriteOptions = {},
): CurrentSceneLiveActor {
  const sprite = source.target as Phaser.GameObjects.Sprite;
  const camera = scene.cameras.main;
  const keys = options.frameKeys ?? [];
  const cycleMs = options.cycleMs ?? 0;
  return {
    id: source.id,
    label: source.label ?? source.id,
    source,
    sourceScrollX: camera.scrollX,
    sourceScrollY: camera.scrollY,
    create: (dialogue) => {
      const clone = dialogue.add
        .sprite(
          sprite.x - camera.scrollX,
          sprite.y - camera.scrollY,
          sprite.texture.key,
          sprite.frame.name,
        )
        .setOrigin(sprite.originX, sprite.originY)
        .setScale(sprite.scaleX, sprite.scaleY)
        .setRotation(sprite.rotation)
        .setFlipX(sprite.flipX)
        .setFlipY(sprite.flipY)
        .setAlpha(sprite.alpha);
      if (options.crop) clone.setCrop(options.crop.x, options.crop.y, options.crop.width, options.crop.height);
      return clone;
    },
    update:
      keys.length > 1 && cycleMs > 0
        ? (target, now) => {
            const clone = target as Phaser.GameObjects.Sprite;
            const key = keys[loopedFrameIndex(now + (options.phaseMs ?? 0), keys.length, cycleMs)];
            if (clone.texture.key !== key) clone.setTexture(key);
          }
        : undefined,
  };
}

/** Snapshot capture hides these exact objects, then CurrentSceneView redraws them live. */
export function hideLiveStageSources(stage: CurrentSceneLiveStage): () => void {
  const sources = stage.actors.map((actor) => {
    const target = actor.source.target as LiveStageTarget;
    const visible = target.visible;
    target.setVisible(false);
    return { target, visible };
  });
  return () => {
    for (const source of sources) source.target.setVisible(source.visible);
  };
}
