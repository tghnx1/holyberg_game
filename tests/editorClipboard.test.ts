import { describe, expect, it } from 'vitest';
import { PASTE_OFFSET, uniqueEditorId } from '../src/game/systems/editor/editorClipboard';

describe('duplicate ids', () => {
  it('appends -copy when that is free', () => {
    expect(uniqueEditorId('homeless-1', new Set(['homeless-1']))).toBe('homeless-1-copy');
  });

  it('keeps counting past an existing copy rather than colliding', () => {
    const taken = new Set(['homeless-1', 'homeless-1-copy']);
    expect(uniqueEditorId('homeless-1', taken)).toBe('homeless-1-copy-1');
  });

  it('skips a whole run of taken suffixes', () => {
    const taken = new Set([
      'obstacle',
      'obstacle-copy',
      'obstacle-copy-1',
      'obstacle-copy-2',
      'obstacle-copy-3',
    ]);
    expect(uniqueEditorId('obstacle', taken)).toBe('obstacle-copy-4');
  });

  it('starts from a caller-supplied suffix, so repeated pastes keep moving', () => {
    const taken = new Set(['npc', 'npc-copy']);
    expect(uniqueEditorId('npc', taken, 5)).toBe('npc-copy-6');
  });

  it('never returns an id already in use, for any starting point', () => {
    const taken = new Set(['a', 'a-copy', 'a-copy-1', 'a-copy-2']);
    for (let start = 0; start < 5; start += 1) {
      expect(taken.has(uniqueEditorId('a', taken, start))).toBe(false);
    }
  });
});

describe('paste offset', () => {
  it('is non-zero, so a copy is never hidden exactly under its original', () => {
    expect(PASTE_OFFSET).toBeGreaterThan(0);
  });
});
