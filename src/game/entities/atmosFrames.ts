/**
 * Shared Atmos sprite data.
 *
 * Kept free of Phaser imports so both the Level 1 autorunner player and the
 * Level 3 boss-arena player resolve frames and ground alignment identically,
 * and so the logic stays testable in the node test environment.
 */

export const ATMOS_RUN_FRAME_KEYS = [
  'atmos-run-1',
  'atmos-run-2',
  'atmos-run-3',
  'atmos-run-4',
  'atmos-run-5',
  'atmos-run-6',
] as const;
export const ATMOS_RUN_STATIC_FRAME_KEY = ATMOS_RUN_FRAME_KEYS[2];
export const ATMOS_JUMP_FRAME_KEYS = [
  'atmos-jump-1',
  'atmos-jump-2',
  'atmos-jump-3',
  'atmos-jump-4',
  'atmos-jump-5',
] as const;
export const ATMOS_CROUCH_FRAME_KEYS = [
  'atmos-crouch-1',
  'atmos-crouch-2',
  'atmos-crouch-3',
] as const;
export const ATMOS_DAMAGE_FRAME_KEY = 'atmos-damage-1';

export type AtmosFrameKey =
  | (typeof ATMOS_RUN_FRAME_KEYS)[number]
  | (typeof ATMOS_JUMP_FRAME_KEYS)[number]
  | (typeof ATMOS_CROUCH_FRAME_KEYS)[number]
  | typeof ATMOS_DAMAGE_FRAME_KEY;

/** One uniform scale for every Atmos state; no state ever squashes the sprite. */
export const ATMOS_VISUAL_SCALE = 0.8;
export const ATMOS_RUN_FRAME_DURATION_MS = 92;
export const ATMOS_CROUCH_FRAME_DURATION_MS = 110;
/** Frames 1-4 are the airborne poses; the last one holds through the fall. */
export const ATMOS_JUMP_FRAME_DURATION_MS = 70;
export const ATMOS_JUMP_ASCENT_FRAME_COUNT = 4;
/** Frame 5 is the landing pose, shown only once the feet are back down. */
export const ATMOS_JUMP_LANDING_FRAME_KEY = ATMOS_JUMP_FRAME_KEYS[4];
export const ATMOS_JUMP_LANDING_DURATION_MS = 120;

/**
 * Transparent padding under the drawn feet in each source PNG, so the visual
 * sits on the same line as the (invisible) physics body's feet.
 */
export const ATMOS_FRAME_FOOT_GAPS: Record<AtmosFrameKey, number> = {
  'atmos-run-1': 4,
  'atmos-run-2': 4,
  'atmos-run-3': 8,
  'atmos-run-4': 4,
  'atmos-run-5': 4,
  'atmos-run-6': 15,
  'atmos-jump-1': 21,
  'atmos-jump-2': 11,
  'atmos-jump-3': 9,
  'atmos-jump-4': 25,
  'atmos-jump-5': 19,
  'atmos-crouch-1': 2,
  'atmos-crouch-2': 4,
  'atmos-crouch-3': 5,
  'atmos-damage-1': 10,
};

/** Y offset that puts the drawn feet of `frameKey` on the sprite's feet line. */
export function getAtmosFootOffset(
  frameKey: AtmosFrameKey,
  visualScale = ATMOS_VISUAL_SCALE,
): number {
  return ATMOS_FRAME_FOOT_GAPS[frameKey] * visualScale;
}

/** Cycles `frames` on a fixed wall-clock cadence. */
export function getLoopedFrame<T extends AtmosFrameKey>(
  frames: readonly T[],
  now: number,
  frameDurationMs: number,
): T {
  return frames[Math.floor(now / frameDurationMs) % frames.length];
}
