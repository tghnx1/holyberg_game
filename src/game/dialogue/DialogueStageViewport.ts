import type Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../constants';
import type { EditableObject } from '../systems/SceneEditor';
import { getSceneObjectLayout, setSceneObjectLayout } from '../systems/sceneLayout';
import { DialogueLayout } from './dialogueConstants';

/**
 * The one place a dialogue's left-hand scene panel is framed.
 *
 * Every dialogue stage — the metro platform, the toilet, and whatever comes
 * next — composes its content in one shared canonical space and hands it to
 * this viewport, which owns everything about *presenting* that content:
 *
 * ```text
 * DialogueStageViewport          <- canonical space, fit, mask, seam, editor
 *   |- stage content             <- what the individual view builds
 *        |- background
 *        |- props
 *        |- PLAYER
 *        |- STORY NPC
 * ```
 *
 * Before this existed, each view carried its own copy of the canonical
 * constants, its own mask, its own fit and its own seam overlap — which is
 * why the metro happened to frame correctly and the toilet needed the same
 * bugs fixed again, separately, one at a time. A new dialogue stage now
 * inherits all of it and writes none of it.
 */

/**
 * The canonical box every dialogue composition is authored against,
 * independent of the live viewport.
 *
 * Equal to the scene panel's own size at the 16:9 aspect the game is designed
 * at, so canonical space and the live panel coincide exactly there and a
 * composition authored on desktop is unchanged bit-for-bit.
 */
export const DIALOGUE_STAGE_CANONICAL_WIDTH = Math.round(
  DESIGN_WIDTH * DialogueLayout.scenePanelWidthRatio,
);
export const DIALOGUE_STAGE_CANONICAL_HEIGHT =
  DESIGN_HEIGHT - DialogueLayout.topBarHeight - DialogueLayout.bottomBarHeight;

/**
 * `Phaser.Scenes.Events.UPDATE`, as its literal value.
 *
 * Spelled out so this module never imports Phaser as a *value*: the framing
 * maths below is unit-tested in the node environment, and pulling in the real
 * package there fails on `window` at import time.
 */
const SCENE_UPDATE_EVENT = 'update';

export interface DialogueStageFit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * The universal stage framing rule, uniform in both axes:
 *
 * - the source scene fills the complete left panel, including the extra width
 *   below its diagonal divider;
 * - any excess is clipped by that panel's shared mask, never fabricated from
 *   a stretched source edge or a flat fill;
 * - scale stays uniform, so scenery and live scene snapshots preserve their
 *   proportions.
 *
 * The diagonal has no rectangular right edge: its widest point is below the
 * nominal scene frame. A contain fit leaves that extra triangular region
 * uncovered; this cover fit makes the actual stage image reach it.
 */
export function computeStageFit(
  panelWidth: number,
  panelHeight: number,
  canonicalWidth = DIALOGUE_STAGE_CANONICAL_WIDTH,
  canonicalHeight = DIALOGUE_STAGE_CANONICAL_HEIGHT,
): DialogueStageFit {
  if (canonicalWidth <= 0 || canonicalHeight <= 0) {
    return { scale: 0, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.max(panelWidth / canonicalWidth, panelHeight / canonicalHeight);
  return {
    scale,
    offsetX: (panelWidth - canonicalWidth * scale) / 2,
    offsetY: (panelHeight - canonicalHeight * scale) / 2,
  };
}

export interface DialogueStageViewportOptions {
  /**
   * Id this stage's whole-composition transform is saved under, within the
   * dialogue scene's slice of the shared scene-layout store. Distinct per
   * stage, since the two dialogues are different compositions running under
   * the same scene key.
   */
  layoutId: string;
  /** Shown in the editor HUD. */
  label?: string;
  canonicalWidth?: number;
  canonicalHeight?: number;
}

/**
 * Owns the root container, the content container the stage fills, the panel
 * mask, the responsive fit, the seam overlap and the whole-scene editor
 * transform with its persistence.
 */
export class DialogueStageViewport {
  /** Added to the dialogue's panel; carries the mask. */
  readonly root: Phaser.GameObjects.Container;
  /** What the stage puts its own objects into. */
  readonly content: Phaser.GameObjects.Container;
  readonly canonicalWidth: number;
  readonly canonicalHeight: number;

  private readonly mask: Phaser.GameObjects.Graphics;
  private panelWidth = 0;
  private panelHeight = 0;
  private renderWidth = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: DialogueStageViewportOptions,
  ) {
    this.canonicalWidth = options.canonicalWidth ?? DIALOGUE_STAGE_CANONICAL_WIDTH;
    this.canonicalHeight = options.canonicalHeight ?? DIALOGUE_STAGE_CANONICAL_HEIGHT;

    this.content = scene.add.container(0, 0, []);
    this.root = scene.add.container(0, 0, [this.content]);
    this.mask = scene.make.graphics({}, false);
    this.root.setMask(this.mask.createGeometryMask());

    // Driven from the scene's own update rather than left to each stage to
    // remember. A GeometryMask follows its own graphics object, not the
    // container it masks, so the mask has to be moved onto the panel every
    // frame the panel moves — and the panel both starts offset by the top bar
    // and slides in on a tween. The metro view happened to do this; the toilet
    // view did not, so its mask sat a full top-bar height above the content
    // and clipped that much off the bottom of the room. Owning it here is what
    // stops the next stage inheriting the same bug.
    scene.events.on(SCENE_UPDATE_EVENT, this.syncMask, this);
  }

  private syncMask(): void {
    this.mask.setPosition(this.root.x, this.root.y);
  }

  /** Puts the stage's own objects into the framed content container. */
  add(children: Phaser.GameObjects.GameObject[]): void {
    this.content.add(children);
  }

  /**
   * Reframes for a new panel size.
   *
   * The panel width already includes the diagonal underlap. The actual stage
   * is uniformly cover-fitted to that width, then clipped by this mask. An
   * authored transform wins outright and is never re-derived, so a resize
   * cannot overwrite a framing set by hand in the editor.
   */
  resize(width: number, height: number, framingWidth = width): void {
    // `width` includes the scene's seam underlap; authoring and composition
    // remain based on the nominal frame width so resizing does not shift art.
    this.panelWidth = framingWidth;
    this.panelHeight = height;
    this.renderWidth = width;
    this.mask
      .clear()
      .fillStyle(0xffffff)
      .fillRect(0, 0, width, height);
    this.syncMask();
    this.applyComposition();
  }

  private applyComposition(): void {
    const saved = getSceneObjectLayout(this.scene.scene.key, this.options.layoutId);
    if (saved?.scale !== undefined) {
      this.content
        .setScale(saved.scale)
        .setPosition((saved.xRatio ?? 0) * this.panelWidth, (saved.yRatio ?? 0) * this.panelHeight);
      return;
    }
    const fit = computeStageFit(
      this.renderWidth,
      this.panelHeight,
      this.canonicalWidth,
      this.canonicalHeight,
    );
    this.content.setScale(fit.scale).setPosition(fit.offsetX, fit.offsetY);
  }

  /**
   * The whole composition, as one editable object. Every stage gets this
   * automatically — moving or uniformly resizing it moves everything the
   * stage built — and may expose its own objects on top of it.
   */
  getEditableObject(): EditableObject {
    return {
      id: this.options.layoutId,
      label: this.options.label ?? 'DIALOGUE SCENE',
      target: this.content,
      getNativeSize: () => ({ width: this.canonicalWidth, height: this.canonicalHeight }),
      onChange: (transform) => {
        setSceneObjectLayout(this.scene.scene.key, this.options.layoutId, {
          xRatio: this.panelWidth > 0 ? transform.x / this.panelWidth : 0,
          yRatio: this.panelHeight > 0 ? transform.y / this.panelHeight : 0,
          // Uniform: `allowNonUniformScale` is left off, so the editor locks
          // the aspect ratio and one number describes the whole transform.
          scale: transform.scaleY,
        });
      },
    };
  }

  destroy(): void {
    this.scene.events.off(SCENE_UPDATE_EVENT, this.syncMask, this);
    this.root.clearMask(true);
    this.mask.destroy();
    this.root.destroy(true);
  }
}
