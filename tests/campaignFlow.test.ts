import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('campaign flow', () => {
  it('inserts Level 4 after RhythmScene and before BossScene', () => {
    const source = readFileSync('src/game/config.ts', 'utf8');
    expect(source).toMatch(
      /scene:\s*\[[^\]]*RhythmScene,\s*Level4Scene,\s*BossScene[^\]]*\]/s,
    );
  });
});
