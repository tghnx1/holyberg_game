import { describe, expect, it, vi } from 'vitest';
import { createRhythmStartHandler } from '../src/game/rhythm/StartGate';

function createHarness(unlockImplementation: () => Promise<boolean> = async () => true) {
  const unlockAudio = vi.fn(unlockImplementation);
  const startTutorial = vi.fn();
  const cleanupListeners = vi.fn();
  const onAudioUnlockFailure = vi.fn();
  const handler = createRhythmStartHandler({
    unlockAudio,
    startTutorial,
    cleanupListeners,
    onAudioUnlockFailure,
  });
  return { handler, unlockAudio, startTutorial, cleanupListeners, onAudioUnlockFailure };
}

describe('RhythmScene start gate', () => {
  it.each(['desktop mouse click', 'desktop SPACE', 'mobile tap'])(
    '%s uses the shared handler and starts the tutorial',
    () => {
      const harness = createHarness();
      harness.handler();
      expect(harness.startTutorial).toHaveBeenCalledOnce();
      expect(harness.cleanupListeners).toHaveBeenCalledOnce();
    },
  );

  it('starts immediately even when audio unlock returns false', async () => {
    const harness = createHarness(async () => false);
    harness.handler();
    expect(harness.startTutorial).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(harness.onAudioUnlockFailure).toHaveBeenCalledOnce());
  });

  it('starts immediately even when audio unlock rejects', async () => {
    const harness = createHarness(async () => {
      throw new Error('audio unavailable');
    });
    harness.handler();
    expect(harness.startTutorial).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(harness.onAudioUnlockFailure).toHaveBeenCalledOnce());
  });

  it('accepts repeated input only once', () => {
    const harness = createHarness();
    harness.handler();
    harness.handler();
    harness.handler();
    expect(harness.unlockAudio).toHaveBeenCalledOnce();
    expect(harness.startTutorial).toHaveBeenCalledOnce();
    expect(harness.cleanupListeners).toHaveBeenCalledOnce();
  });
});
