import type { DialoguePresentationConfig } from './dialoguePresentation';

/**
 * Bounds for the global head size. Wide enough for any sensible composition,
 * tight enough that a stray editor drag cannot persist a value that renders
 * every portrait invisible or fills the screen with one nostril.
 */
const MIN_FILL_RATIO = 0.1;
const MAX_FILL_RATIO = 6;

/** Used by the dev-only save endpoint; rejects anything malformed or out of range. */
export function validateDialoguePresentation(value: unknown): DialoguePresentationConfig {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected a dialogue presentation object');
  }
  const { portraitFillRatio } = value as Record<string, unknown>;
  if (typeof portraitFillRatio !== 'number' || !Number.isFinite(portraitFillRatio)) {
    throw new Error('"portraitFillRatio" must be a finite number');
  }
  if (portraitFillRatio < MIN_FILL_RATIO || portraitFillRatio > MAX_FILL_RATIO) {
    throw new Error(
      `"portraitFillRatio" must be between ${MIN_FILL_RATIO} and ${MAX_FILL_RATIO} (got ${portraitFillRatio})`,
    );
  }
  return { portraitFillRatio };
}
