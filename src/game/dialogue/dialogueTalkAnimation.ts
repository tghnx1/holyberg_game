/**
 * Pure timing for a 2-frame talking portrait's mouth-flap cycle.
 *
 * Kept separate from dialogueTiming.ts (the typewriter/hold/glitch pacing)
 * since this is a different, independent clock: it only cares about how
 * long a speaker has been actively talking, not the dialogue's own phase
 * durations.
 */

/** Within the requested 120-160ms range. */
export const TALK_FRAME_INTERVAL_MS = 140;

/**
 * Which of the two frames should be showing `elapsedMs` into a talking
 * window: false = idle (frame 1), true = talking (frame 2). Starts on the
 * idle frame at elapsedMs = 0, matching "start from frame 1" on every
 * speaker/line change.
 */
export function isTalkFrameActive(elapsedMs: number, intervalMs = TALK_FRAME_INTERVAL_MS): boolean {
  if (elapsedMs < 0) return false;
  return Math.floor(elapsedMs / intervalMs) % 2 === 1;
}
