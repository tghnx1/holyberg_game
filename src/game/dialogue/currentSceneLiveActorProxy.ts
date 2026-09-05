import type Phaser from 'phaser';
import type { EditableObject, EditableTransform } from '../systems/SceneEditor';
import type { CurrentSceneLiveActor, LiveStageTarget } from './currentSceneLiveStage';

/** Maps one real dialogue clone back onto the already-supported source editable object. */
export function buildLiveActorEditable(
  definition: CurrentSceneLiveActor,
  target: LiveStageTarget,
): EditableObject {
  return {
    id: definition.id,
    label: definition.label,
    target,
    getNativeSize: definition.source.getNativeSize,
    resizable: definition.source.resizable,
    allowNonUniformScale: definition.source.allowNonUniformScale,
    flipHorizontal: definition.source.flipHorizontal
      ? () => {
          definition.source.flipHorizontal?.();
          const source = definition.source.target as Phaser.GameObjects.Sprite;
          (target as Phaser.GameObjects.Sprite).setFlipX(source.flipX);
        }
      : undefined,
    onChange: (transform: EditableTransform) => {
      const sourceTransform = {
        ...transform,
        x: transform.x + definition.sourceScrollX,
        y: transform.y + definition.sourceScrollY,
      };
      definition.source.target
        .setPosition(sourceTransform.x, sourceTransform.y)
        .setScale(sourceTransform.scaleX, sourceTransform.scaleY);
      definition.source.onChange?.(sourceTransform);
    },
  };
}
