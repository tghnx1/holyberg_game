/**
 * Lets a native HTML `<input>` overlaid on the game receive every key it
 * should, even while Phaser's keyboard system is live underneath it.
 *
 * Phaser's global key capture calls `preventDefault()` on any key a scene has
 * captured (gameplay/editor shortcuts: WASD, E, C, V, P, Space, ...) as soon
 * as it arrives at the browser, regardless of which element currently has
 * focus — an HTML input sitting on top of the canvas is not exempt. That is
 * enough to silently drop some of those characters while typing into it (an
 * Instagram handle containing "a", "d", "p", ...). Phaser's own
 * `disableGlobalCapture`/`enableGlobalCapture` toggle exactly this, without
 * touching the capture list itself or requiring a custom input system.
 */
export interface CaptureKeyboardPlugin {
  disableGlobalCapture(): unknown;
  enableGlobalCapture(): unknown;
}

/** The slice of the DOM API this needs — real or a test stand-in. */
export interface FocusCaptureTarget {
  addEventListener(type: 'focus' | 'blur', listener: () => void): void;
  removeEventListener(type: 'focus' | 'blur', listener: () => void): void;
}

/**
 * Disables Phaser's global key capture for as long as `target` has focus,
 * and restores it on blur. Returns an unsubscribe function that also
 * restores capture immediately — call it when the input is torn down, so a
 * modal removed without a preceding blur (e.g. programmatic cleanup) can
 * never leave capture disabled behind it.
 */
export function releaseKeyboardCaptureWhileFocused(
  keyboard: CaptureKeyboardPlugin | null | undefined,
  target: FocusCaptureTarget,
): () => void {
  const onFocus = (): void => {
    keyboard?.disableGlobalCapture();
  };
  const onBlur = (): void => {
    keyboard?.enableGlobalCapture();
  };
  target.addEventListener('focus', onFocus);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('focus', onFocus);
    target.removeEventListener('blur', onBlur);
    keyboard?.enableGlobalCapture();
  };
}
