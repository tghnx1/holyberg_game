import rawPresentation from '../assets/dialoguePresentation.json';
import type { CharacterDefinition } from '../characters/characterManifest';
import { resolveDialogueScale } from '../characters/characterManifest';
import { computePortraitFitScale } from './dialogueLayoutMetrics';

/**
 * Global dialogue presentation, shared by every dialogue scene and every
 * character.
 *
 * The head size a speaker is drawn at is one setting for the whole game, not a
 * property of a script, a scene or a character:
 *
 * ```text
 * global portraitFillRatio        <- this file, edited in SceneEditor
 *         v
 * shared portrait fit             <- computePortraitFitScale, canvas -> panel
 *         v
 * per-character calibration       <- presentation.dialogueScale, 1 = reference
 *         v
 * every dialogue
 * ```
 *
 * Atmos is the reference: its `dialogueScale` is 1, so the global ratio alone
 * decides its head size, and every other character is calibrated relative to
 * it. A new dialogue scene inherits all of this by drawing its speakers
 * through `TalkingPortrait`; a new character inherits it by having a portrait
 * at all. Neither needs a constant of its own.
 */
export interface DialoguePresentationConfig {
  /**
   * How much of the portrait panel a speaker's portrait canvas fills, before
   * that character's own calibration. This is the global head-size knob.
   */
  portraitFillRatio: number;
}

export const DEFAULT_DIALOGUE_PRESENTATION = rawPresentation as DialoguePresentationConfig;

/**
 * Live value, seeded from the checked-in config. SceneEditor mutates this so
 * a resize is visible immediately in every portrait on screen, and the saved
 * file is what makes the change outlive the session.
 */
let current: DialoguePresentationConfig = { ...DEFAULT_DIALOGUE_PRESENTATION };

export function getDialoguePresentation(): DialoguePresentationConfig {
  return current;
}

export function setPortraitFillRatio(ratio: number): void {
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  current = { ...current, portraitFillRatio: ratio };
}

/** Restores the checked-in value; used by tests to undo a local edit. */
export function resetDialoguePresentation(): void {
  current = { ...DEFAULT_DIALOGUE_PRESENTATION };
}

/**
 * The one place a portrait's scale is decided: the shared canvas fit at the
 * current global head size, times this character's own calibration.
 */
export function resolvePortraitScale(
  character: CharacterDefinition,
  panelWidth: number,
  panelHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): number {
  return (
    computePortraitFitScale(
      panelWidth,
      panelHeight,
      sourceWidth,
      sourceHeight,
      current.portraitFillRatio,
    ) * resolveDialogueScale(character)
  );
}

/**
 * Inverse of `resolvePortraitScale`: the global ratio that would draw this
 * character's portrait at `scale`.
 *
 * This is what lets SceneEditor resize a portrait directly and have the result
 * land in the *global* setting rather than in that one character's
 * calibration — the calibration is divided back out, so dragging Doctor Doms'
 * portrait moves every character's head size by the same proportion and their
 * relative calibration is preserved.
 */
export function portraitFillRatioForScale(
  character: CharacterDefinition,
  scale: number,
  panelWidth: number,
  panelHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): number {
  const unitFit = computePortraitFitScale(panelWidth, panelHeight, sourceWidth, sourceHeight, 1);
  const calibration = resolveDialogueScale(character);
  if (unitFit <= 0 || calibration <= 0) return current.portraitFillRatio;
  return scale / (unitFit * calibration);
}
