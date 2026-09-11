import Phaser from 'phaser';
import { designPointFromLayout, layoutRatiosFromDesignPoint } from './designSpace';
import type { EditableObject } from './SceneEditor';
import { getSceneObjectLayout, setSceneObjectLayout } from './sceneLayout';
import {
  resolveGameplayScale,
  type CharacterDefinition,
  type CharacterGameplayPose,
} from '../characters/characterManifest';

/**
 * Editable *visual* presentation for a level's main playable character.
 *
 * Strictly presentation: the values here are a drawing offset and a scale
 * multiplier applied to the sprite, on top of wherever gameplay has already
 * put the character. Nothing in this file is read by physics — no body size,
 * no speed, no collision, no balance — so dragging the player around in the
 * editor cannot change how the level plays, only how it looks.
 *
 * Shared so every level gets the same behaviour and the same persisted shape
 * from one call, rather than each one growing its own player-editing code.
 */

/** Reserved id, so every scene's player entry looks the same in the config. */
export const PLAYER_EDITABLE_ID = 'player';

export interface PlayerVisualOffset {
  offsetX: number;
  offsetY: number;
  scale: number;
  flipX: boolean;
}

/**
 * One identity-independent PLAYER multiplier on top of the normalized
 * manifest scale. SceneEditor edits this multiplier, so changing characters
 * never requires another size calibration.
 */
export function resolvePlayerPresentationScale(
  character: CharacterDefinition,
  pose: CharacterGameplayPose,
  sharedScale: number,
): number {
  return resolveGameplayScale(character, pose) * sharedScale;
}

/**
 * The saved offset for this scene, in world pixels.
 *
 * Resolved against the canonical `DESIGN_SPACE` box rather than the live
 * camera: this is a displacement from the character's gameplay anchor — a
 * distance in the world, next to whatever scenery the character is standing
 * beside — so it must not grow with the browser window the way it did when
 * it was multiplied by `camera.width`, which on a landscape phone drew the
 * character further from its own anchor than the layout was authored with.
 */
export function getPlayerVisualOffset(sceneKey: string): PlayerVisualOffset {
  const layout = getSceneObjectLayout(sceneKey, PLAYER_EDITABLE_ID);
  const offset = designPointFromLayout(layout, { x: 0, y: 0 });
  return {
    offsetX: offset.x,
    offsetY: offset.y,
    scale: layout?.scale ?? 1,
    flipX: layout?.flipX === true,
  };
}

export interface PlayerEditableOptions {
  /** The drawn sprite. Never a physics body. */
  sprite: Phaser.GameObjects.Sprite;
  /**
   * Where gameplay currently wants the sprite drawn, before any editor offset.
   * Read live, so the offset stays correct as the character walks.
   */
  getAnchor: () => { x: number; y: number };
  /** The sprite's own natural scale from the character manifest. */
  getBaseScale: () => number;
  /**
   * How much the scene scales one design-space unit by before drawing —
   * Level 2's room transform, for instance. Everything persisted here is
   * design-space, so a scene that draws through a transform has to have it
   * divided back out. Defaults to 1: a scene that draws design units
   * one-to-one, which is every scene at the design size.
   */
  getDesignScale?: () => number;
  /** Re-applies the sprite's position/scale after the editor changes them. */
  refresh: () => void;
}

/**
 * Registers the main player as an editable object whose transform is stored as
 * an offset from its gameplay anchor plus a scale multiplier.
 *
 * Storing an *offset* rather than an absolute position is what makes this work
 * in a scrolling level: the character keeps walking under player control while
 * the editor is open, and the saved value still means the same thing next run.
 * The offset itself is world-space (see `getPlayerVisualOffset`), so it also
 * means the same thing on the next *device*.
 */
export function createPlayerEditable(
  scene: Phaser.Scene,
  options: PlayerEditableOptions,
): EditableObject {
  const { sprite, getAnchor, getBaseScale, refresh } = options;
  const designScale = (): number => {
    const scale = options.getDesignScale?.() ?? 1;
    return scale > 0 ? scale : 1;
  };
  return {
    id: PLAYER_EDITABLE_ID,
    label: 'PLAYER (visual only)',
    target: sprite,
    resizable: true,
    getNativeSize: () => {
      const frame = sprite.frame;
      return { width: frame.realWidth, height: frame.realHeight };
    },
    onChange: (transform) => {
      const anchor = getAnchor();
      const base = getBaseScale();
      const drawn = designScale();
      setSceneObjectLayout(scene.scene.key, PLAYER_EDITABLE_ID, {
        ...getSceneObjectLayout(scene.scene.key, PLAYER_EDITABLE_ID),
        ...layoutRatiosFromDesignPoint({
          x: (transform.x - anchor.x) / drawn,
          y: (transform.y - anchor.y) / drawn,
        }),
        scale: base > 0 ? transform.scaleY / base / drawn : 1,
      });
      refresh();
    },
    flipHorizontal: () => {
      const current = getSceneObjectLayout(scene.scene.key, PLAYER_EDITABLE_ID);
      setSceneObjectLayout(scene.scene.key, PLAYER_EDITABLE_ID, {
        ...current,
        flipX: current?.flipX !== true,
      });
      refresh();
    },
  };
}
