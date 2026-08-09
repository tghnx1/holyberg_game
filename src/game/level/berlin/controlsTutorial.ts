import type { BerlinEntity } from './types';

/**
 * Pure state machine for the two-step controls tutorial.
 *
 * Deliberately free of Phaser so the rules — what counts as a real hold, when
 * the run timer is allowed to start, when the tutorial should run at all — can
 * be tested directly. ControlsTutorialSystem owns the visuals and calls in here
 * for every decision.
 */

export type TutorialStage = 'jump' | 'doubleJump' | 'duck' | 'complete';

/** A tap must not pass for a hold; crouch has to stay down this long. */
export const DUCK_HOLD_MS = 900;
/** The jump cue appears this long after the run starts, not on the start gate. */
export const JUMP_CUE_DELAY_MS = 2000;
/** And the duck cue this long after the jump cue is satisfied. */
export const DUCK_CUE_DELAY_MS = 1000;
/**
 * Safety net for the duck cue. The sequence is time-based, but the level only
 * has so much clear ground before the first duck obstacle, so the cue also
 * fires on reaching this point — whichever comes first. Without it a slow
 * first jump would push the cue past the obstacle the player is meant to be
 * taught about.
 */
export const DUCK_TRIGGER_LEAD = 200;
/** However tight the level is, each cue still gets this much running first. */
export const MIN_CUE_DELAY_MS = 1000;

export interface TutorialState {
  stage: TutorialStage;
  /** True while the guided run is active; false when only the reminder shows. */
  guided: boolean;
  /** Milliseconds the crouch has been continuously held. */
  duckHeldMs: number;
  /** Set once the duck stage has taken control of the player. */
  duckPromptActive: boolean;
  /** Time since the run started, driving the delay before the jump cue. */
  runElapsedMs: number;
  /** The jump cue is on screen and a jump now counts toward the tutorial. */
  jumpCueVisible: boolean;
  /** Time since the jump cue was satisfied; -1 until then. */
  sinceJumpMs: number;
  /** Delays actually in use, shortened when the level has no room for them. */
  jumpDelayMs: number;
  duckDelayMs: number;
}

export function createTutorialState(guided: boolean): TutorialState {
  return {
    stage: guided ? 'jump' : 'complete',
    guided,
    duckHeldMs: 0,
    duckPromptActive: false,
    runElapsedMs: 0,
    jumpCueVisible: false,
    sinceJumpMs: -1,
    jumpDelayMs: JUMP_CUE_DELAY_MS,
    duckDelayMs: DUCK_CUE_DELAY_MS,
  };
}

/**
 * The tutorial runs on every start of this level: it is short, and a player
 * who skipped or half-read it last time gets another chance rather than being
 * locked out by a flag they cannot see.
 *
 * The run timer stays gated for the whole guided tutorial, so a player reading
 * the prompts is never punished for it.
 */
export function isTimerGated(state: TutorialState): boolean {
  return state.stage !== 'complete';
}

/** Obstacle penalties are suspended while the duck prompt holds the player. */
export function arePenaltiesSuspended(state: TutorialState): boolean {
  return state.duckPromptActive;
}

/**
 * The input that starts the run also jumps, so the very first tap teaches the
 * control instead of being swallowed by the intro. It is a single impulse: the
 * jump buffer is cleared when consumed, so one press can never spend both jumps.
 */
export function resolveIntroStart(state: TutorialState): { startRun: true; jump: boolean } {
  return { startRun: true, jump: state.guided };
}

/** Advances the sequence clocks. Call once per frame while the run is live. */
export function tickTutorial(state: TutorialState, deltaMs: number): void {
  if (state.stage === 'complete') return;
  state.runElapsedMs += deltaMs;
  if (state.sinceJumpMs >= 0) state.sinceJumpMs += deltaMs;
}

/**
 * Fits both cues into the ground actually available before the first duck
 * obstacle. The player is frozen while a cue is up, so only the running
 * stretches count: jump delay, then duck delay. When the level is roomy both
 * keep their full length; when it is tight they shrink together rather than
 * the duck cue slamming into the jump cue with no running in between.
 */
export function planCueDelays(
  startX: number,
  safeX: number | undefined,
  runSpeed: number,
): { jumpDelayMs: number; duckDelayMs: number } {
  const wanted = JUMP_CUE_DELAY_MS + DUCK_CUE_DELAY_MS;
  if (safeX === undefined || runSpeed <= 0) {
    return { jumpDelayMs: JUMP_CUE_DELAY_MS, duckDelayMs: DUCK_CUE_DELAY_MS };
  }
  const budgetMs = ((safeX - startX) / runSpeed) * 1000;
  if (budgetMs >= wanted) return { jumpDelayMs: JUMP_CUE_DELAY_MS, duckDelayMs: DUCK_CUE_DELAY_MS };
  const scale = Math.max(0, budgetMs) / wanted;
  return {
    jumpDelayMs: Math.max(MIN_CUE_DELAY_MS, JUMP_CUE_DELAY_MS * scale),
    duckDelayMs: Math.max(MIN_CUE_DELAY_MS, DUCK_CUE_DELAY_MS * scale),
  };
}

/** The jump cue waits out its planned delay of actual running first. */
export function shouldShowJumpCue(state: TutorialState): boolean {
  return state.stage === 'jump' && !state.jumpCueVisible && state.runElapsedMs >= state.jumpDelayMs;
}

/**
 * Normal gameplay jump input is only allowed once the tutorial is ready for
 * it. The intro start jump is handled separately by the scene and remains a
 * special exception.
 */
export function canAcceptTutorialJumpInput(state: TutorialState): boolean {
  if (state.stage === 'jump') return state.jumpCueVisible;
  return state.stage === 'doubleJump' || state.stage === 'duck' || state.stage === 'complete';
}

/**
 * Advances past the jump stage only once a real impulse was applied *while the
 * cue was on screen*. The input that starts the run also jumps, and that one
 * must not silently satisfy a lesson the player has not been shown yet.
 *
 * Hands over to the double-jump stage rather than straight to duck: the player
 * is airborne and still frozen, which is exactly the moment to ask for the
 * second impulse.
 */
export function registerJump(state: TutorialState, jumped: boolean): boolean {
  if (!jumped || state.stage !== 'jump' || !state.jumpCueVisible) return false;
  state.stage = 'doubleJump';
  return true;
}

/**
 * The second impulse only counts when it really is the second of one airtime,
 * so tapping again after landing keeps the cue up instead of passing it.
 */
export function registerDoubleJump(
  state: TutorialState,
  jumped: boolean,
  jumpsThisAirtime: number,
): boolean {
  if (!jumped || state.stage !== 'doubleJump' || jumpsThisAirtime < 2) return false;
  state.stage = 'duck';
  state.jumpCueVisible = false;
  state.sinceJumpMs = 0;
  return true;
}

/** World x at which the duck prompt takes over, derived from the real level. */
export function duckTriggerX(entities: readonly BerlinEntity[]): number | undefined {
  let earliest: number | undefined;
  for (const entity of entities) {
    if (entity.type !== 'obstacle' || entity.action !== 'duck') continue;
    const leftEdge = entity.x - entity.width / 2;
    if (earliest === undefined || leftEdge < earliest) earliest = leftEdge;
  }
  return earliest === undefined ? undefined : earliest - DUCK_TRIGGER_LEAD;
}

/**
 * Fires DUCK_CUE_DELAY_MS after the jump cue was satisfied, or earlier if the
 * player is about to reach the first duck obstacle — whichever comes first.
 */
export function shouldStartDuckPrompt(state: TutorialState, playerX: number, triggerX?: number): boolean {
  if (state.stage !== 'duck' || state.duckPromptActive) return false;
  // The planned delay comes first; the world trigger is only a backstop for a
  // level edit that moves the obstacle after the delays were planned.
  if (state.sinceJumpMs < MIN_CUE_DELAY_MS) return false;
  if (state.sinceJumpMs >= state.duckDelayMs) return true;
  return triggerX !== undefined && playerX >= triggerX;
}

/**
 * Accumulates crouch time, resetting the moment the input is released so a tap
 * can never add up to a hold. Returns true on the frame the hold is satisfied.
 */
export function updateDuckHold(state: TutorialState, crouching: boolean, deltaMs: number): boolean {
  if (state.stage !== 'duck' || !state.duckPromptActive) return false;
  if (!crouching) {
    state.duckHeldMs = 0;
    return false;
  }
  state.duckHeldMs += deltaMs;
  if (state.duckHeldMs < DUCK_HOLD_MS) return false;
  state.stage = 'complete';
  state.duckPromptActive = false;
  return true;
}

/** Drops any in-flight tutorial state, e.g. when the scene shuts down. */
export function resetTutorialState(state: TutorialState): void {
  state.duckHeldMs = 0;
  state.duckPromptActive = false;
}
