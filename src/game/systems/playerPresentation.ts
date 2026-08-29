import Phaser from 'phaser';
import type { EditableObject } from './SceneEditor';
import { getSceneObjectLayout, setSceneObjectLayout } from './sceneLayout';

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
}

/**
 * The saved offset for this scene, resolved against the current viewport.
 * Ratios rather than pixels, so one saved value is right on desktop and phone.
 */
export function getPlayerVisualOffset(
  sceneKey: string,
  viewportWidth: number,
  viewportHeight: number,
): PlayerVisualOffset {
  const layout = getSceneObjectLayout(sceneKey, PLAYER_EDITABLE_ID);
  return {
    offsetX: (layout?.xRatio ?? 0) * viewportWidth,
    offsetY: (layout?.yRatio ?? 0) * viewportHeight,
    scale: layout?.scale ?? 1,
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
 */
export function createPlayerEditable(
  scene: Phaser.Scene,
  options: PlayerEditableOptions,
): EditableObject {
  const { sprite, getAnchor, getBaseScale, refresh } = options;
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
      const camera = scene.cameras.main;
      const anchor = getAnchor();
      const base = getBaseScale();
      setSceneObjectLayout(scene.scene.key, PLAYER_EDITABLE_ID, {
        xRatio: camera.width > 0 ? (transform.x - anchor.x) / camera.width : 0,
        yRatio: camera.height > 0 ? (transform.y - anchor.y) / camera.height : 0,
        scale: base > 0 ? transform.scaleY / base : 1,
      });
      refresh();
    },
  };
}
