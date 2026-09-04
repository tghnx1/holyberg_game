import { describe, expect, it } from 'vitest';
import { buildBossEndingDialogue, buildBossResult } from '../src/game/boss/bossEnding';
import { createEmptyRhythmResult } from '../src/game/level/level4/level4Flow';

describe('Boss ending flow', () => {
  it('uses the shared dialogue scene contract for the final Magician line', () => {
    const script = buildBossEndingDialogue();
    expect(script.id).toBe('boss-final-magician');
    expect(script.sceneId).toBe('currentScene');
    expect(script.defaultSpeaker).toEqual({ type: 'role', role: 'magician' });
  });

  it('preserves the incoming rhythm result and adds the existing boss score fields', () => {
    const rhythm = { ...createEmptyRhythmResult(), berlinScore: 500, score: 900 };
    const result = buildBossResult(rhythm, {
      score: 1200,
      hits: 2,
      maxCombo: 4,
      emeralds: 3,
      emeraldScore: 300,
    });
    expect(result).toMatchObject({
      berlinScore: 500,
      score: 900,
      bossScore: 1200,
      bossHits: 2,
      bossMaxCombo: 4,
      bossEmeralds: 3,
      bossEmeraldScore: 300,
    });
  });
});
