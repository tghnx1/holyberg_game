import { describe, expect, it, vi } from 'vitest';
import {
  HOLYWORLD_GAME_URL,
  STORY_CARD_HEIGHT,
  STORY_CARD_WIDTH,
  selectStoryLeaderboardRows,
  scoreShareText,
  shareScoreResult,
} from '../src/game/leaderboard/scoreShare';
import {
  createSharePreviewResult,
  createSharePreviewSnapshot,
  isSharePreviewEnabled,
} from '../src/game/leaderboard/sharePreview';

const score = {
  rank: 23,
  score: 12_450,
  instagram: 'holyberg_',
  leaderboard: [
    { instagram: 'aaa', bestScore: 18_900 },
    { instagram: 'bbb', bestScore: 17_450 },
  ],
};
const file = { name: 'holyworld-score.png', type: 'image/png' } as File;

describe('score sharing', () => {
  it('uses a full-resolution 9:16 Story canvas and the public game URL', () => {
    expect(STORY_CARD_WIDTH).toBe(1080);
    expect(STORY_CARD_HEIGHT).toBe(1920);
    expect(HOLYWORLD_GAME_URL).toBe('https://tghnx1.github.io/holyberg_game/');
  });

  it('provides representative claimed data for the hidden read-only preview routes', () => {
    expect(isSharePreviewEnabled('?scene=result&sharePreview=1', true)).toBe(true);
    expect(isSharePreviewEnabled('?scene=result&sharePreview=1', false)).toBe(false);
    expect(isSharePreviewEnabled('?holyworldSharePreview=1', false)).toBe(true);
    expect(isSharePreviewEnabled('?holyworldSharePreview=1', true)).toBe(true);
    expect(isSharePreviewEnabled('?scene=result', true)).toBe(false);

    const snapshot = createSharePreviewSnapshot();
    expect(snapshot.instagram).toBe('preview_player');
    expect(snapshot.rank).toBe(5);
    expect(snapshot.top10).toContainEqual({ instagram: 'preview_player', bestScore: 12_450 });
    const result = createSharePreviewResult();
    expect(result.berlinScore + result.score).toBe(12_450);
  });

  it('selects two leaderboard rows on either side of the player', () => {
    const leaderboard = Array.from({ length: 8 }, (_, index) => ({
      instagram: index === 4 ? 'holyberg_' : `player${index + 1}`,
      bestScore: 20_000 - index * 500,
    }));

    expect(selectStoryLeaderboardRows({ ...score, rank: 5, score: 18_000, leaderboard })).toEqual([
      { rank: 3, instagram: 'player3', score: 19_000, isPlayer: false },
      { rank: 4, instagram: 'player4', score: 18_500, isPlayer: false },
      { rank: 5, instagram: 'holyberg_', score: 18_000, isPlayer: true },
      { rank: 6, instagram: 'player6', score: 17_500, isPlayer: false },
      { rank: 7, instagram: 'player7', score: 17_000, isPlayer: false },
    ]);
  });

  it('starts at rank one near the top and fills missing lower rows from above', () => {
    const leaderboard = Array.from({ length: 6 }, (_, index) => ({
      instagram: index === 1 ? 'holyberg_' : `player${index + 1}`,
      bestScore: 20_000 - index * 500,
    }));
    expect(
      selectStoryLeaderboardRows({ ...score, rank: 2, score: 19_500, leaderboard }).map(
        (row) => row.rank,
      ),
    ).toEqual([1, 2, 3, 4, 5]);

    const playerLast = Array.from({ length: 6 }, (_, index) => ({
      instagram: index === 5 ? 'holyberg_' : `player${index + 1}`,
      bestScore: 20_000 - index * 500,
    }));
    expect(
      selectStoryLeaderboardRows({ ...score, rank: 6, score: 17_500, leaderboard: playerLast }).map(
        (row) => row.rank,
      ),
    ).toEqual([2, 3, 4, 5, 6]);
  });

  it('falls back to the player plus available real rows without duplicates', () => {
    const rows = selectStoryLeaderboardRows({
      ...score,
      leaderboard: [
        { instagram: 'aaa', bestScore: 18_900 },
        { instagram: '@AAA', bestScore: 18_800 },
        { instagram: 'bbb', bestScore: 17_450 },
      ],
    });

    expect(rows).toEqual([
      { rank: 1, instagram: 'aaa', score: 18_900, isPlayer: false },
      { rank: 3, instagram: 'bbb', score: 17_450, isPlayer: false },
      { rank: 23, instagram: 'holyberg_', score: 12_450, isPlayer: true },
    ]);
    expect(new Set(rows.map((row) => row.instagram)).size).toBe(rows.length);
  });

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
