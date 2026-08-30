/**
 * Timing and frame selection for character animation.
 *
 * Every value here belongs to the gameplay systems, not to a character: two
 * characters with different frame counts animate at the same tempo and move
 * at the same speed. `CharacterDefinition` supplies artwork only.
 *
 * Durations are per *cycle*, never per frame. A 4-frame and an 8-frame run
 * therefore both complete in RUN_CYCLE_MS; a per-frame duration would make a
 * character with more frames run visibly slower, which would turn an art
 * decision into a gameplay one.
 *
 * The current values are Atmos's existing timings expressed as cycles, so his
 * animation is unchanged: 92ms x 6 run frames, 110ms x 3 crouch frames,
 * 70ms x 4 airborne jump frames, and a 120ms landing hold.
 */

export const RUN_CYCLE_MS = 552;
/**
 * Walking is a slower cadence than running, not the same cycle replayed with
 * different artwork: the connective levels move the player at WALK_SPEED, and
 * a run-speed cycle over walk frames reads as a nervous shuffle.
 */
export const WALK_CYCLE_MS = 840;
export const CROUCH_CYCLE_MS = 330;
/** Spread across however many airborne frames a character has. */
export const JUMP_AIRBORNE_MS = 280;
export const JUMP_LANDING_HOLD_MS = 120;

/**
 * Frame index for a looping animation at wall-clock `now`.
 *
 * Equivalent to the previous `floor(now / frameDuration) % frameCount` when
 * `cycleMs === frameDuration * frameCount`, so Atmos's cadence is preserved
 * exactly while any other frame count now fits the same cycle.
 */
export function loopedFrameIndex(now: number, frameCount: number, cycleMs: number): number {
  if (frameCount <= 0) return 0;
  if (cycleMs <= 0 || !Number.isFinite(now)) return 0;
  const phase = ((now % cycleMs) + cycleMs) % cycleMs;
  return Math.min(frameCount - 1, Math.floor((phase / cycleMs) * frameCount));
}

/**
 * Extra hold, as a multiple of a plain frame's share of the cycle, for the
 * 4th and 5th walk frames (index 3 and 4): the foot-contact poses in a walk
 * cycle read better held a little longer than the mid-swing frames around
 * them. By position, not by character or art set, so any walk sequence long
 * enough to have a 4th/5th frame gets the same hitch, and a shorter one is
 * unaffected — this is not a per-character override.
 */
const WALK_FRAME_HOLD_WEIGHT: Partial<Record<number, number>> = { 3: 1.5, 4: 1.5 };

/**
 * Like `loopedFrameIndex`, but frames 4 and 5 of the sequence (if present)
 * hold for `WALK_FRAME_HOLD_WEIGHT` times as long as the others. The cycle
 * still completes in exactly `cycleMs`, so WALK_CYCLE_MS is unchanged —
 * only the internal split between frames shifts.
 */
export function walkFrameIndex(now: number, frameCount: number, cycleMs: number): number {
  if (frameCount <= 0) return 0;
  if (cycleMs <= 0 || !Number.isFinite(now)) return 0;
  let totalWeight = 0;
  for (let i = 0; i < frameCount; i += 1) totalWeight += WALK_FRAME_HOLD_WEIGHT[i] ?? 1;
  const phase = ((now % cycleMs) + cycleMs) % cycleMs;
  const target = (phase / cycleMs) * totalWeight;
  let elapsed = 0;
  for (let i = 0; i < frameCount; i += 1) {
    elapsed += WALK_FRAME_HOLD_WEIGHT[i] ?? 1;
    if (target < elapsed) return i;
  }
  return frameCount - 1;
}

/**
 * How many of a character's jump frames are the airborne sequence.
 *
 * The manifest convention is that the last frame is the landing pose, so it
 * never plays while the player is still in the air. A single-frame jump has
 * nothing to reserve, so that frame does double duty.
 */
export function airborneFrameCount(jumpFrameCount: number): number {
  return jumpFrameCount <= 1 ? Math.max(jumpFrameCount, 0) : jumpFrameCount - 1;
}

/** Index of the landing pose: the last frame, or the only one. */
export function landingFrameIndex(jumpFrameCount: number): number {
  return Math.max(0, jumpFrameCount - 1);
}

/**
 * Airborne frame `elapsed` ms into a jump, clamped to the last airborne pose
 * so a long fall holds rather than tipping into the landing frame.
 *
 * The whole airborne sequence always spans JUMP_AIRBORNE_MS regardless of how
 * many frames it contains.
 */
export function jumpFrameIndex(elapsedMs: number, jumpFrameCount: number): number {
  const airborne = airborneFrameCount(jumpFrameCount);
  if (airborne <= 0) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  const perFrame = JUMP_AIRBORNE_MS / airborne;
  return Math.min(airborne - 1, Math.floor(elapsedMs / perFrame));
}

/**
 * The settled pose used when a character is standing about rather than
 * running — the middle of the run cycle, which is Atmos's frame 3 of 6 and
 * generalises to any count.
 */
export function staticRunFrameIndex(frameCount: number): number {
  if (frameCount <= 0) return 0;
  return Math.floor((frameCount - 1) / 2);
}

/**
 * Vertical nudge that seats a frame on the floor line. `footGap` is the
 * measured or authored padding below the drawn feet, in source pixels, so it
 * scales with however large the character is drawn.
 */
export function footOffset(footGap: number, visualScale: number): number {
  return footGap * visualScale;
}
