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
 * How far a stage renders past the panel's own logical width.
 *
 * The divider between the scene panel and the portrait panel leans right as
 * it descends, so a stage masked strictly to the panel width stops on a
 * vertical line and leaves a black wedge between that line and the divider's
 * left edge. Only the *mask* is widened by this; the composition is never
 * stretched or duplicated to reach it, and the divider drawn on top covers
 * its own band regardless.
 */
export const DIALOGUE_STAGE_RENDER_OVERLAP =
  DialogueLayout.dividerSkew + DialogueLayout.dividerThickness;

export interface DialogueStageFit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * The universal framing rule, uniform in both axes:
 *
 * - the complete canonical composition fits vertically inside the dialogue
 *   body, so nothing useful is ever clipped at the top or the bottom and the
 *   scene can never bleed into the speaker/text area;
 * - horizontally it is centred, and whatever the art naturally extends past
 *   the panel edge is allowed to show through under the diagonal divider.
 *
 * Deliberately *not* a cover fit. Cover takes `max(w/W, h/H)`, so on any
 * panel wider than the canonical aspect it scales up past the panel height
 * and crops the composition top and bottom — which is exactly the class of
 * bug each stage was fixing for itself. At the 16:9 aspect the game is
 * designed at, panel and canonical box coincide and this returns scale 1,
 * so desktop framing is identical to what a cover fit produced there.
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
  const scale = panelHeight / canonicalHeight;
  return {
    scale,
    offsetX: (panelWidth - canonicalWidth * scale) / 2,
    // Exact by construction: the composition is scaled to the panel height,
    // so it starts at the top and ends at the bottom with nothing cut off.
    offsetY: 0,
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
  }

  /** Puts the stage's own objects into the framed content container. */
  add(children: Phaser.GameObjects.GameObject[]): void {
    this.content.add(children);
  }

  /**
   * Reframes for a new panel size.
   *
   * The mask is widened by the seam overlap; the fit itself is always
   * computed against the real panel size, never the widened one, so
   * extending that coverage neither rescales nor repositions the stage. An
   * authored transform wins outright and is never re-derived, so a resize
   * cannot re-crop a framing that was set by hand in the editor.
   */
  resize(width: number, height: number): void {
    this.panelWidth = width;
    this.panelHeight = height;
    this.mask
      .clear()
      .fillStyle(0xffffff)
      .fillRect(0, 0, width + DIALOGUE_STAGE_RENDER_OVERLAP, height);
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
      this.panelWidth,
      this.panelHeight,
      this.canonicalWidth,
      this.canonicalHeight,
    );
    this.content.setScale(fit.scale).setPosition(fit.offsetX, fit.offsetY);
  }

  /** Keeps the mask tracking the panel's on-screen position. */
  update(): void {
    this.mask.setPosition(this.root.x, this.root.y);
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
    this.root.clearMask(true);
    this.mask.destroy();
    this.root.destroy(true);
  }
}
