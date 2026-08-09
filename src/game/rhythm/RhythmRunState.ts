export interface ResettableRhythmInput {
  reset(): void;
}

export interface RhythmRunResetState {
  playing: false;
  starting: false;
  finished: false;
  lastBeat: -1;
  tutorialReady: false;
  tutorial: undefined;
  tutorialNote: undefined;
  tutorialPrompt: undefined;
}

/** Returns a fresh run state and clears input history owned across scene runs. */
export function resetRhythmRunState(
  inputGuard: ResettableRhythmInput,
  antiMash: ResettableRhythmInput,
): RhythmRunResetState {
  inputGuard.reset();
  antiMash.reset();
  return {
    playing: false,
    starting: false,
    finished: false,
    lastBeat: -1,
    tutorialReady: false,
    tutorial: undefined,
    tutorialNote: undefined,
    tutorialPrompt: undefined,
  };
}
