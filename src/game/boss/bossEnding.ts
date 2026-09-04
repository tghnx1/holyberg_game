import { roleRef } from '../characters/characterRef';
import type { DialogueScript } from '../dialogue/types';
import type { RhythmResult } from '../rhythm/types';

export const BOSS_ENDING_DIALOGUE_RESUMED_EVENT = 'boss-ending-dialogue-complete';

export const BOSS_ENDING_TIMING = {
  chargeMs: 800,
  projectileMs: 520,
  settleMs: 760,
} as const;

export function buildBossEndingDialogue(): DialogueScript {
  return {
    id: 'boss-final-magician',
    sceneId: 'currentScene',
    title: 'HOLYWORLD',
    defaultSpeaker: roleRef('magician'),
    lines: [{
      text: "Ah. Sorry. He does this. Give him a century, he'll grow out of it. Welcome home.",
      speakerName: 'THE MAGICIAN',
    }],
    nextScene: 'LevelCompleteScene',
  };
}

export function buildBossResult(
  rhythmResult: RhythmResult,
  score: { score: number; hits: number; maxCombo: number; emeralds: number; emeraldScore: number },
): RhythmResult {
  return {
    ...rhythmResult,
    bossScore: score.score,
    bossHits: score.hits,
    bossMaxCombo: score.maxCombo,
    bossEmeralds: score.emeralds,
    bossEmeraldScore: score.emeraldScore,
  };
}
