import type { CharacterAssetRef } from '../characters/characterManifest';

/**
 * Drives one character-appearance sequence: shows each `frames` entry in
 * order, `frameDurationMs` apart, then switches to `settledFrame` and calls
 * `onComplete`.
 *
 * Pure with respect to time and rendering — `schedule` and `onShowFrame` are
 * both injected — so the pacing/ordering can be verified without a running
 * Phaser scene or a real clock. `StationSceneView`'s metro entrance and
 * `BossScene`'s final-dialogue Disus entrance both drive their own sprite
 * this way rather than sharing a renderer, since one animates a `Sprite` in
 * place and the other steps a dialogue-clone's texture/position — only the
 * stepping logic here is shared.
 */
export function stepAppearFrames(options: {
  frames: readonly CharacterAssetRef[];
  settledFrame: CharacterAssetRef;
  frameDurationMs: number;
  /** Called once per step, including the final settle. */
  onShowFrame: (frame: CharacterAssetRef) => void;
  schedule: (delayMs: number, callback: () => void) => void;
  onComplete: () => void;
}): void {
  const { frames, settledFrame, frameDurationMs, onShowFrame, schedule, onComplete } = options;
  if (frames.length === 0) {
    onShowFrame(settledFrame);
    onComplete();
    return;
  }
  let index = 0;
  const showNext = (): void => {
    const frame = frames[index];
    onShowFrame(frame);
    index += 1;
    if (index < frames.length) {
      schedule(frameDurationMs, showNext);
      return;
    }
    schedule(frameDurationMs, () => {
      onShowFrame(settledFrame);
      onComplete();
    });
  };
  showNext();
}
