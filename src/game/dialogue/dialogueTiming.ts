/**
 * Text-length-based pacing for the typewriter.
 *
 * Pure so the reading pace can be tuned and tested without a running scene.
 * All values are milliseconds.
 */
export const DIALOGUE_TIMING = {
  /** Fast typewriter: milliseconds per visible character. */
  msPerCharacter: 18,
  /** A newline costs a short beat rather than a full character. */
  msPerNewline: 40,
  /** Floor and ceiling on the pause after a line has finished typing. */
  minHoldMs: 4000,
  maxHoldMs: 5600,
  /** Hold grows with the line length so long lines get more reading time. */
  holdMsPerCharacter: 100,
  /** Quick glitch/flash covering the swap between two lines. */
  glitchMs: 130,
  /** Beat after the last line before the panels slide out. */
  finalHoldMs: 1400,
  /** Panel slide in/out duration. */
  slideMs: 420,
  /** How long SPACE must be held before the dialogue is skipped. */
  skipHoldMs: 600,
} as const;

/** Characters that actually get typed (newlines are handled separately). */
export const getTypedCharacterCount = (text: string): number =>
  text.replace(/\n/g, '').length;

/** How long the typewriter takes to reveal `text` in full. */
export function getTypingDurationMs(text: string): number {
  const newlines = text.length - text.replace(/\n/g, '').length;
  return (
    getTypedCharacterCount(text) * DIALOGUE_TIMING.msPerCharacter +
    newlines * DIALOGUE_TIMING.msPerNewline
  );
}

/** Pause after a line finishes typing, scaled by its length and clamped. */
export function getHoldDurationMs(text: string, override?: number): number {
  if (override !== undefined) return override;
  const scaled = getTypedCharacterCount(text) * DIALOGUE_TIMING.holdMsPerCharacter;
  return Math.min(
    DIALOGUE_TIMING.maxHoldMs,
    Math.max(DIALOGUE_TIMING.minHoldMs, scaled),
  );
}

/** Total on-screen time for one line: typing plus its hold. */
export const getLineDurationMs = (text: string, override?: number): number =>
  getTypingDurationMs(text) + getHoldDurationMs(text, override);

/** How many characters should be visible `elapsedMs` into typing `text`. */
export function getRevealedCharacterCount(text: string, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  const total = getTypedCharacterCount(text);
  if (elapsedMs >= getTypingDurationMs(text)) return total;
  let budget = elapsedMs;
  let revealed = 0;
  for (const character of text) {
    const cost =
      character === '\n' ? DIALOGUE_TIMING.msPerNewline : DIALOGUE_TIMING.msPerCharacter;
    if (budget < cost) break;
    budget -= cost;
    if (character !== '\n') revealed += 1;
  }
  return Math.min(total, revealed);
}

/**
 * Renders `text` with only the first `revealed` printable characters shown.
 * Newlines inside the revealed prefix are kept, so a multi-line block types
 * out line by line and already-visible text never moves.
 */
export function getRevealedText(text: string, revealed: number): string {
  let remaining = revealed;
  let output = '';
  for (const character of text) {
    if (character === '\n') {
      output += character;
      continue;
    }
    if (remaining <= 0) break;
    output += character;
    remaining -= 1;
  }
  return output;
}
