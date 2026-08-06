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



export interface JumpInput {
  now: number;
  grounded: boolean;
  crouched: boolean;
  lastGroundedAt: number;
  bufferedUntil: number;
  jumpCount: number;
}

export interface JumpResolution {
  jumped: boolean;
  lastGroundedAt: number;
  bufferedUntil: number;
  jumpCount: number;
}

/**
 * The whole jump model in one pure step, so its rules can be tested without a
 * physics body: two impulses per airtime, both full strength, reset only on
 * real ground contact, coyote time for the first, and a buffer that is cleared
 * on consumption so one press is worth exactly one jump.
 */
export function resolveJumpImpulse(input: JumpInput): JumpResolution {
  const { now, grounded, crouched, bufferedUntil } = input;
  let { lastGroundedAt, jumpCount } = input;

  if (grounded) {
    lastGroundedAt = now;
    jumpCount = 0;
  } else if (jumpCount === 0 && now > lastGroundedAt + COYOTE_TIME_MS) {
    // Walked off an edge and let coyote time lapse: the ground jump is
    // forfeit, which leaves exactly one air jump rather than two.
    jumpCount = 1;
  }

  const buffered = now <= bufferedUntil;
  const firstJump = canConsumeJump(now, lastGroundedAt, bufferedUntil, crouched);
  const airJump = buffered && !crouched && jumpCount > 0 && jumpCount < 2;
  if (!firstJump && !airJump) return { jumped: false, lastGroundedAt, bufferedUntil, jumpCount };

  return { jumped: true, lastGroundedAt, bufferedUntil: -Infinity, jumpCount: jumpCount + 1 };
}
