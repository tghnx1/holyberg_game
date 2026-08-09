import { describe, expect, it } from 'vitest';
import {
  createTutorialState,
  DUCK_CUE_DELAY_MS,
  DUCK_HOLD_MS,
  DUCK_TRIGGER_LEAD,
  JUMP_CUE_DELAY_MS,
  MIN_CUE_DELAY_MS,
  canAcceptTutorialJumpInput,
  planCueDelays,
  duckTriggerX,
  isTimerGated,
  registerDoubleJump,
  registerJump,
  resetTutorialState,
  resolveIntroStart,
  shouldShowJumpCue,
  shouldStartDuckPrompt,
  tickTutorial,
  updateDuckHold,
} from '../src/game/level/berlin/controlsTutorial';
import { BERLIN_ENTITIES } from '../src/game/level/berlin/berlinLevelConfig';
import { JUMP_BUFFER_MS, resolveJumpImpulse } from '../src/game/level/berlin/playerPhysics';

describe('controls tutorial gating', () => {
  it('runs the guided tutorial every time the level starts', () => {
    // No completion flag and no storage: two fresh starts are identical.
    const first = createTutorialState(true);
    const second = createTutorialState(true);
    expect(first.stage).toBe('jump');
    expect(second.stage).toBe('jump');
    expect(first.guided).toBe(true);
    expect(isTimerGated(first)).toBe(true);
  });

  it('keeps the run timer gated until every stage is done', () => {
    const state = createTutorialState(true);
    expect(isTimerGated(state)).toBe(true);
    tickTutorial(state, JUMP_CUE_DELAY_MS);
    state.jumpCueVisible = shouldShowJumpCue(state);
    registerJump(state, true);
    expect(state.stage).toBe('doubleJump');
    expect(isTimerGated(state)).toBe(true);
    registerDoubleJump(state, true, 2);
    expect(state.stage).toBe('duck');
    expect(isTimerGated(state)).toBe(true);
    state.duckPromptActive = true;
    updateDuckHold(state, true, DUCK_HOLD_MS);
    expect(state.stage).toBe('complete');
    expect(isTimerGated(state)).toBe(false);
  });
});

describe('controls tutorial stages', () => {
  it('makes the start input also perform the jump on a guided run', () => {
    expect(resolveIntroStart(createTutorialState(true))).toEqual({ startRun: true, jump: true });
  });

  it('blocks normal jump input before the jump cue appears', () => {
    const state = createTutorialState(true);
    expect(canAcceptTutorialJumpInput(state)).toBe(false);
    state.stage = 'jump';
    state.jumpCueVisible = false;
    expect(canAcceptTutorialJumpInput(state)).toBe(false);
  });

  it('allows normal jump input once the cue is visible', () => {
    const state = createTutorialState(true);
    state.stage = 'jump';
    state.jumpCueVisible = true;
    expect(canAcceptTutorialJumpInput(state)).toBe(true);
  });

  it('shows the jump cue only after the delay, and ignores the start jump', () => {
    const state = createTutorialState(true);
    // The input that starts the run jumps immediately; the cue is not up yet,
    // so it must not tick the lesson off.
    expect(shouldShowJumpCue(state)).toBe(false);
    expect(registerJump(state, true)).toBe(false);
    expect(state.stage).toBe('jump');

    tickTutorial(state, JUMP_CUE_DELAY_MS - 16);
    expect(shouldShowJumpCue(state)).toBe(false);
    tickTutorial(state, 16);
    expect(shouldShowJumpCue(state)).toBe(true);
    state.jumpCueVisible = true;

    expect(registerJump(state, false)).toBe(false);
    expect(registerJump(state, true)).toBe(true);
    expect(state.stage).toBe('doubleJump');
    expect(state.sinceJumpMs).toBe(-1);
  });

  it('only advances to double jump on the first real jump of the airtime', () => {
    const state = createTutorialState(true);
    tickTutorial(state, JUMP_CUE_DELAY_MS);
    state.jumpCueVisible = true;
    expect(registerJump(state, true)).toBe(true);
    expect(state.stage).toBe('doubleJump');

    const consumed = createTutorialState(true);
    tickTutorial(consumed, JUMP_CUE_DELAY_MS);
    consumed.jumpCueVisible = true;
    consumed.stage = 'jump';
    expect(registerJump(consumed, true)).toBe(true);
    consumed.stage = 'doubleJump';
    expect(registerDoubleJump(consumed, true, 2)).toBe(true);
    expect(consumed.stage).toBe('duck');
  });

  it('requires the second impulse of one airtime for the double jump', () => {
    const state = createTutorialState(true);
    tickTutorial(state, JUMP_CUE_DELAY_MS);
    state.jumpCueVisible = true;
    registerJump(state, true);
    expect(state.stage).toBe('doubleJump');
    // Landing and tapping again is a first jump, not a double jump.
    expect(registerDoubleJump(state, true, 1)).toBe(false);
    expect(state.stage).toBe('doubleJump');
    // No impulse at all does nothing either.
    expect(registerDoubleJump(state, false, 2)).toBe(false);
    // The real second impulse passes the stage on.
    expect(registerDoubleJump(state, true, 2)).toBe(true);
    expect(state.stage).toBe('duck');
    expect(state.jumpCueVisible).toBe(false);
    expect(state.sinceJumpMs).toBe(0);
  });

  it('shows the duck cue two seconds after the jump cue is satisfied', () => {
    const state = createTutorialState(true);
    tickTutorial(state, JUMP_CUE_DELAY_MS);
    state.jumpCueVisible = true;
    registerJump(state, true);
    registerDoubleJump(state, true, 2);

    // No world trigger in play: purely the delay.
    tickTutorial(state, DUCK_CUE_DELAY_MS - 16);
    expect(shouldStartDuckPrompt(state, 0, undefined)).toBe(false);
    tickTutorial(state, 16);
    expect(shouldStartDuckPrompt(state, 0, undefined)).toBe(true);
  });

  it('compresses the cue spacing when the level has no room for it', () => {
    // Roomy: both delays keep their full length.
    expect(planCueDelays(230, 230 + 260 * 10, 260)).toEqual({
      jumpDelayMs: JUMP_CUE_DELAY_MS,
      duckDelayMs: DUCK_CUE_DELAY_MS,
    });
    // Tight: they shrink together rather than stacking, never past the floor.
    // Asserted as bounds so retuning the constants cannot break the test.
    const tight = planCueDelays(230, 260, 260);
    expect(tight.jumpDelayMs).toBeLessThanOrEqual(JUMP_CUE_DELAY_MS);
    expect(tight.duckDelayMs).toBeLessThanOrEqual(DUCK_CUE_DELAY_MS);
    expect(tight.jumpDelayMs).toBeGreaterThanOrEqual(MIN_CUE_DELAY_MS);
    expect(tight.duckDelayMs).toBeGreaterThanOrEqual(MIN_CUE_DELAY_MS);
    // No obstacle at all: nothing to fit around.
    expect(planCueDelays(230, undefined, 260).jumpDelayMs).toBe(JUMP_CUE_DELAY_MS);
  });

  it('always gives the player some running between the two cues', () => {
    const state = createTutorialState(true);
    state.jumpDelayMs = MIN_CUE_DELAY_MS;
    state.duckDelayMs = MIN_CUE_DELAY_MS;
    tickTutorial(state, MIN_CUE_DELAY_MS);
    state.jumpCueVisible = true;
    registerJump(state, true);
    registerDoubleJump(state, true, 2);
    // The world trigger is already behind the player, but the duck cue must
    // still wait: landing a jump may not immediately re-freeze the player.
    expect(shouldStartDuckPrompt(state, 99999, 0)).toBe(false);
    tickTutorial(state, MIN_CUE_DELAY_MS);
    expect(shouldStartDuckPrompt(state, 99999, 0)).toBe(true);
  });

  it('brings the duck cue forward if the obstacle is reached first', () => {
    const state = createTutorialState(true);
    tickTutorial(state, JUMP_CUE_DELAY_MS);
    state.jumpCueVisible = true;
    registerJump(state, true);
    registerDoubleJump(state, true, 2);
    state.duckDelayMs = Number.MAX_SAFE_INTEGER;
    tickTutorial(state, MIN_CUE_DELAY_MS + 16);
    // Full delay not elapsed, but the player is at the safety trigger.
    expect(shouldStartDuckPrompt(state, 1200, 1000)).toBe(true);
  });

  it('requires a real hold rather than a tap', () => {
    const state = createTutorialState(true);
    state.stage = 'duck';
    state.duckPromptActive = true;
    // A tap: down for a couple of frames, then released.
    expect(updateDuckHold(state, true, 16)).toBe(false);
    expect(updateDuckHold(state, true, 16)).toBe(false);
    expect(updateDuckHold(state, false, 16)).toBe(false);
    expect(state.duckHeldMs).toBe(0);
    // Tapping repeatedly must not accumulate toward the hold.
    for (let i = 0; i < 20; i += 1) {
      updateDuckHold(state, true, 16);
      updateDuckHold(state, false, 16);
    }
    expect(state.stage).toBe('duck');
    // A genuine hold completes it.
    let completed = false;
    for (let elapsed = 0; elapsed <= DUCK_HOLD_MS + 16 && !completed; elapsed += 16) {
      completed = updateDuckHold(state, true, 16);
    }
    expect(completed).toBe(true);
    expect(state.stage).toBe('complete');
    expect(state.duckPromptActive).toBe(false);
  });

  it('derives the duck trigger from the configured first duck obstacle', () => {
    const duckObstacles = BERLIN_ENTITIES.filter(
      (entity) => entity.type === 'obstacle' && entity.action === 'duck',
    );
    expect(duckObstacles.length).toBeGreaterThan(0);
    const earliest = Math.min(...duckObstacles.map((entity) => entity.x - entity.width / 2));
    const trigger = duckTriggerX(BERLIN_ENTITIES);
    expect(trigger).toBe(earliest - DUCK_TRIGGER_LEAD);
    // Far enough ahead that the obstacle cannot be reached first.
    expect(trigger!).toBeLessThan(earliest);
    expect(duckTriggerX([])).toBeUndefined();
  });

  it('starts the duck prompt once only', () => {
    const state = createTutorialState(true);
    state.stage = 'duck';
    // Isolate the world-trigger path: the delay must not be what fires it.
    state.duckDelayMs = Number.MAX_SAFE_INTEGER;
    state.sinceJumpMs = MIN_CUE_DELAY_MS;
    expect(shouldStartDuckPrompt(state, 900, 1000)).toBe(false);
    expect(shouldStartDuckPrompt(state, 1000, 1000)).toBe(true);
    state.duckPromptActive = true;
    expect(shouldStartDuckPrompt(state, 1200, 1000)).toBe(false);
  });

  it('clears in-flight state safely on shutdown', () => {
    const state = createTutorialState(true);
    state.stage = 'duck';
    state.duckPromptActive = true;
    state.duckHeldMs = 120;
    resetTutorialState(state);
    expect(state.duckPromptActive).toBe(false);
    expect(state.duckHeldMs).toBe(0);
    // A frame arriving after teardown must not resurrect the prompt.
    expect(updateDuckHold(state, true, 1000)).toBe(false);
    expect(state.stage).toBe('duck');
  });
});

describe('jump impulses', () => {
  const base = { grounded: true, crouched: false, lastGroundedAt: 0, jumpCount: 0 };

  it('lets one start press buy exactly one jump', () => {
    const now = 1000;
    const bufferedUntil = now + JUMP_BUFFER_MS;
    const first = resolveJumpImpulse({ ...base, now, bufferedUntil });
    expect(first.jumped).toBe(true);
    expect(first.jumpCount).toBe(1);
    // The same press, one frame later in the air: the buffer was cleared, so
    // it cannot also spend the second jump.
    const second = resolveJumpImpulse({
      ...base,
      now: now + 16,
      grounded: false,
      lastGroundedAt: first.lastGroundedAt,
      bufferedUntil: first.bufferedUntil,
      jumpCount: first.jumpCount,
    });
    expect(second.jumped).toBe(false);
    expect(second.jumpCount).toBe(1);
  });

  it('allows a second jump only from a separate press', () => {
    const airborne = { grounded: false, crouched: false, lastGroundedAt: 0, jumpCount: 1 };
    const result = resolveJumpImpulse({ ...airborne, now: 500, bufferedUntil: 500 + JUMP_BUFFER_MS });
    expect(result.jumped).toBe(true);
    expect(result.jumpCount).toBe(2);
    const third = resolveJumpImpulse({
      ...airborne,
      now: 600,
      jumpCount: 2,
      bufferedUntil: 600 + JUMP_BUFFER_MS,
    });
    expect(third.jumped).toBe(false);
  });

  it('gives a single air jump after coyote time lapses', () => {
    const lastGroundedAt = 0;
    const now = 500;
    const first = resolveJumpImpulse({
      now,
      grounded: false,
      crouched: false,
      lastGroundedAt,
      jumpCount: 0,
      bufferedUntil: now + JUMP_BUFFER_MS,
    });
    expect(first.jumped).toBe(true);
    expect(first.jumpCount).toBe(2);
    const second = resolveJumpImpulse({
      now: now + 50,
      grounded: false,
      crouched: false,
      lastGroundedAt,
      jumpCount: first.jumpCount,
      bufferedUntil: now + 50 + JUMP_BUFFER_MS,
    });
    expect(second.jumped).toBe(false);
  });
});
