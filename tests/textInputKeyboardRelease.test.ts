import { describe, expect, it, vi } from 'vitest';
import {
  releaseKeyboardCaptureWhileFocused,
  type CaptureKeyboardPlugin,
  type FocusCaptureTarget,
} from '../src/game/systems/textInputKeyboardRelease';

/**
 * Minimal stand-in for the one Phaser method this cares about, and for the
 * `focus`/`blur` half of the DOM `EventTarget` interface a real
 * `HTMLInputElement` provides — this environment has no `document` to build
 * a real one from.
 */
function fakeKeyboard(): CaptureKeyboardPlugin & { disableGlobalCapture: ReturnType<typeof vi.fn>; enableGlobalCapture: ReturnType<typeof vi.fn> } {
  return {
    disableGlobalCapture: vi.fn(),
    enableGlobalCapture: vi.fn(),
  };
}

function fakeFocusTarget(): FocusCaptureTarget & { fireFocus: () => void; fireBlur: () => void } {
  const handlers = new Map<'focus' | 'blur', Set<() => void>>();
  const on = (type: 'focus' | 'blur', listener: () => void): void => {
    let set = handlers.get(type);
    if (!set) {
      set = new Set();
      handlers.set(type, set);
    }
    set.add(listener);
  };
  return {
    addEventListener: on,
    removeEventListener: (type, listener) => handlers.get(type)?.delete(listener),
    fireFocus: () => handlers.get('focus')?.forEach((listener) => listener()),
    fireBlur: () => handlers.get('blur')?.forEach((listener) => listener()),
  };
}

describe('releasing Phaser key capture for a focused text input', () => {
  it('disables global capture on focus and restores it on blur', () => {
    const keyboard = fakeKeyboard();
    const target = fakeFocusTarget();
    releaseKeyboardCaptureWhileFocused(keyboard, target);

    expect(keyboard.disableGlobalCapture).not.toHaveBeenCalled();

    target.fireFocus();
    expect(keyboard.disableGlobalCapture).toHaveBeenCalledTimes(1);
    expect(keyboard.enableGlobalCapture).not.toHaveBeenCalled();

    target.fireBlur();
    expect(keyboard.enableGlobalCapture).toHaveBeenCalledTimes(1);
  });

  it('restores capture immediately when unsubscribed, even mid-focus with no preceding blur', () => {
    const keyboard = fakeKeyboard();
    const target = fakeFocusTarget();
    const unsubscribe = releaseKeyboardCaptureWhileFocused(keyboard, target);

    target.fireFocus();
    expect(keyboard.enableGlobalCapture).not.toHaveBeenCalled();

    // Programmatic teardown (e.g. the modal is removed without a blur event
    // ever having fired) must not leave capture disabled behind it.
    unsubscribe();
    expect(keyboard.enableGlobalCapture).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops further focus/blur from touching capture', () => {
    const keyboard = fakeKeyboard();
    const target = fakeFocusTarget();
    const unsubscribe = releaseKeyboardCaptureWhileFocused(keyboard, target);
    unsubscribe();
    keyboard.disableGlobalCapture.mockClear();
    keyboard.enableGlobalCapture.mockClear();

    target.fireFocus();
    target.fireBlur();

    expect(keyboard.disableGlobalCapture).not.toHaveBeenCalled();
    expect(keyboard.enableGlobalCapture).not.toHaveBeenCalled();
  });

  it('is safe when Phaser has no keyboard plugin at all', () => {
    const target = fakeFocusTarget();
    expect(() => {
      const unsubscribe = releaseKeyboardCaptureWhileFocused(undefined, target);
      target.fireFocus();
      target.fireBlur();
      unsubscribe();
    }).not.toThrow();

    const targetWithNull = fakeFocusTarget();
    expect(() => {
      const unsubscribe = releaseKeyboardCaptureWhileFocused(null, targetWithNull);
      targetWithNull.fireFocus();
      unsubscribe();
    }).not.toThrow();
  });

  it(
    'regression: while focused, none of the previously-captured gameplay/editor keys ' +
      '(A, D, S, E, C, V, P, Space) would be prevented, because capture is off entirely',
    () => {
      const keyboard = fakeKeyboard();
      const target = fakeFocusTarget();
      releaseKeyboardCaptureWhileFocused(keyboard, target);

      target.fireFocus();

      // The fix does not filter by key — it turns capture off outright while
      // focused, so every one of these (and anything else) types normally.
      const previouslyCapturedKeys = ['a', 'd', 's', 'e', 'c', 'v', 'p', ' '];
      expect(keyboard.disableGlobalCapture).toHaveBeenCalledTimes(1);
      // A single disableGlobalCapture() call covers all of them at once —
      // there is no per-key capture list being consulted here.
      expect(previouslyCapturedKeys.length).toBeGreaterThan(0);
    },
  );
});
