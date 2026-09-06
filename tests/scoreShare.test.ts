import { describe, expect, it, vi } from 'vitest';
import {
  HOLYWORLD_GAME_URL,
  scoreShareText,
  shareScoreResult,
} from '../src/game/leaderboard/scoreShare';

const score = { rank: 23, score: 12_450 };
const file = { name: 'holyworld-score.png', type: 'image/png' } as File;

describe('score sharing', () => {
  it('shares the generated image File together with text and the game URL when supported', async () => {
    const share = vi.fn(async () => undefined);
    const canShare = vi.fn(() => true);
    const result = await shareScoreResult(score, {
      navigator: { share, canShare },
      createCardFile: async () => file,
    });

    expect(result).toBe('file-shared');
    expect(canShare).toHaveBeenCalledWith(expect.objectContaining({ files: [file] }));
    expect(share).toHaveBeenCalledWith({
      title: 'HOLYWORLD score',
      text: scoreShareText(score),
      url: HOLYWORLD_GAME_URL,
      files: [file],
    });
  });

  it('falls back to text and URL Web Share when file sharing is unsupported', async () => {
    const share = vi.fn(async () => undefined);
    const result = await shareScoreResult(score, {
      navigator: { share, canShare: () => false },
      createCardFile: async () => file,
    });

    expect(result).toBe('text-shared');
    expect(share).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledWith({
      title: 'HOLYWORLD score',
      text: scoreShareText(score),
      url: HOLYWORLD_GAME_URL,
    });
  });

  it('copies share-friendly text and URL when Web Share is unavailable', async () => {
    const writeText = vi.fn(async () => undefined);
    const result = await shareScoreResult(score, { navigator: { clipboard: { writeText } } });

    expect(result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(`${scoreShareText(score)} ${HOLYWORLD_GAME_URL}`);
  });

  it('uses an explicit copy prompt when neither share nor clipboard is available', async () => {
    const prompt = vi.fn();
    const result = await shareScoreResult(score, { navigator: {}, prompt });

    expect(result).toBe('prompted');
    expect(prompt).toHaveBeenCalledWith(
      'Copy your HOLYWORLD score',
      `${scoreShareText(score)} ${HOLYWORLD_GAME_URL}`,
    );
  });
});
