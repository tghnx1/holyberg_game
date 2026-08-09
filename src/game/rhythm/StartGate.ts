export interface RhythmStartActions {
  unlockAudio: () => Promise<boolean>;
  startTutorial: () => void;
  cleanupListeners: () => void;
  onAudioUnlockFailure?: (error?: unknown) => void;
}

/**
 * Creates the single one-shot handler used by pointer and keyboard input.
 * Audio is attempted synchronously from the gesture, but its async result is
 * deliberately outside the gate: it can never hold the tutorial overlay open.
 */
export function createRhythmStartHandler(actions: RhythmStartActions): () => void {
  let accepted = false;

  return () => {
    if (accepted) return;
    accepted = true;

    let unlockAttempt: Promise<boolean> | undefined;
    try {
      unlockAttempt = actions.unlockAudio();
    } catch (error) {
      actions.onAudioUnlockFailure?.(error);
    }

    actions.cleanupListeners();
    actions.startTutorial();

    void unlockAttempt
      ?.then((unlocked) => {
        if (!unlocked) actions.onAudioUnlockFailure?.();
      })
      .catch((error: unknown) => actions.onAudioUnlockFailure?.(error));
  };
}
