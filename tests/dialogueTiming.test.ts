import { describe, expect, it } from 'vitest';
import {
  DIALOGUE_TIMING,
  getHoldDurationMs,
  getLineDurationMs,
  getRevealedCharacterCount,
  getRevealedText,
  getTypedCharacterCount,
  getTypingDurationMs,
} from '../src/game/dialogue/dialogueTiming';
import {
  DIALOGUE_SCRIPTS,
  getDialogueScript,
  METRO_MAGICIAN_DIALOGUE,
} from '../src/game/dialogue/dialogueScripts';

describe('dialogue timing', () => {
  it('counts only printable characters, not newlines', () => {
    expect(getTypedCharacterCount('AB\nCD')).toBe(4);
    expect(getTypedCharacterCount('I KNOW YOU!')).toBe(11);
  });

  it('derives typing duration from text length', () => {
    expect(getTypingDurationMs('ABC')).toBe(3 * DIALOGUE_TIMING.msPerCharacter);
    expect(getTypingDurationMs('AB\nC')).toBe(
      3 * DIALOGUE_TIMING.msPerCharacter + DIALOGUE_TIMING.msPerNewline,
    );
    // Longer lines take longer to type.
    expect(getTypingDurationMs('A LONGER LINE')).toBeGreaterThan(getTypingDurationMs('SHORT'));
  });

  it('scales the hold with length but clamps both ends', () => {
    expect(getHoldDurationMs('!')).toBe(DIALOGUE_TIMING.minHoldMs);
    expect(getHoldDurationMs('X'.repeat(500))).toBe(DIALOGUE_TIMING.maxHoldMs);
    const medium = getHoldDurationMs('X'.repeat(50));
    expect(medium).toBeGreaterThan(DIALOGUE_TIMING.minHoldMs);
    expect(medium).toBeLessThan(DIALOGUE_TIMING.maxHoldMs);
  });

  it('honours a per-line hold override', () => {
    expect(getHoldDurationMs('SHORT', 4000)).toBe(4000);
    expect(getLineDurationMs('SHORT', 4000)).toBe(getTypingDurationMs('SHORT') + 4000);
  });

  it('reveals characters progressively and finishes exactly on time', () => {
    const text = 'I KNOW YOU!';
    expect(getRevealedCharacterCount(text, 0)).toBe(0);
    expect(getRevealedCharacterCount(text, DIALOGUE_TIMING.msPerCharacter)).toBe(1);
    expect(getRevealedCharacterCount(text, getTypingDurationMs(text))).toBe(
      getTypedCharacterCount(text),
    );
    // Never overruns past the end of the line.
    expect(getRevealedCharacterCount(text, 999_999)).toBe(getTypedCharacterCount(text));
  });

  it('keeps newlines inside the revealed prefix so visible text never moves', () => {
    const text = 'AB\nCD';
    expect(getRevealedText(text, 0)).toBe('');
    expect(getRevealedText(text, 1)).toBe('A');
    // The newline appears with the character that follows it, not before.
    expect(getRevealedText(text, 2)).toBe('AB\n');
    expect(getRevealedText(text, 3)).toBe('AB\nC');
    expect(getRevealedText(text, 4)).toBe(text);
  });
});

describe('dialogue scripts', () => {
  it('holds the metro dialogue in order', () => {
    expect(METRO_MAGICIAN_DIALOGUE.lines.map((line) => line.text)).toEqual([
      'I KNOW YOU!',
      "YOU'RE NOT FROM THIS WORLD.\nLITERALLY.",
      "I CAN OPEN YOU A PORTAL HOME,\nBUT YOU NEED TO PROVE YOU'RE\nCOOL ENOUGH FOR IT.",
      'LOCK IT IN:\nMADAME CLAUDE\n9 OCTOBER\n22:00',
    ]);
  });

  it('continues into Level 1 when it ends', () => {
    expect(METRO_MAGICIAN_DIALOGUE.nextScene).toBe('BerlinScene');
    expect(METRO_MAGICIAN_DIALOGUE.sceneId).toBe('metroStation');
    expect(METRO_MAGICIAN_DIALOGUE.defaultSpeaker).toEqual({ type: 'role', role: 'magician' });
  });

  it('is registered and looked up by id', () => {
    expect(getDialogueScript('metro-magician')).toBe(METRO_MAGICIAN_DIALOGUE);
    expect(getDialogueScript('does-not-exist')).toBeUndefined();
    for (const [id, script] of Object.entries(DIALOGUE_SCRIPTS)) {
      expect(script.id).toBe(id);
      expect(script.lines.length).toBeGreaterThan(0);
    }
  });

  it('every line has a finite, positive on-screen duration', () => {
    for (const line of METRO_MAGICIAN_DIALOGUE.lines) {
      const duration = getLineDurationMs(line.text, line.holdMsOverride);
      expect(duration).toBeGreaterThan(0);
      expect(Number.isFinite(duration)).toBe(true);
    }
  });
});
