import type { PlayerBodySpec } from './types';

const PLAYER_FRAME_HEIGHT = 98;

export const STANDING_BODY: PlayerBodySpec = {
  width: 44,
  height: 90,
  offsetX: 18,
  offsetY: PLAYER_FRAME_HEIGHT - 90,
};
export const CROUCHING_BODY: PlayerBodySpec = {
  width: 44,
  height: 50,
  offsetX: 18,
  offsetY: PLAYER_FRAME_HEIGHT - 50,
};
export const COYOTE_TIME_MS = 140;
export const JUMP_BUFFER_MS = 160;

export function playerBodyFor(crouched: boolean): PlayerBodySpec {
  return crouched ? CROUCHING_BODY : STANDING_BODY;
}

export function canConsumeJump(
  now: number,
  lastGroundedAt: number,
  bufferedUntil: number,
  crouched: boolean,
): boolean {
  return !crouched && now <= lastGroundedAt + COYOTE_TIME_MS && now <= bufferedUntil;
}


