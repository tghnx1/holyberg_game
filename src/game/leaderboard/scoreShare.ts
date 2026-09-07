import type { LeaderboardEntry } from './domain';

export const HOLYWORLD_GAME_URL = 'https://tghnx1.github.io/holyberg_game/';
export const STORY_CARD_GAME_URL = 'tghnx1.github.io/holyberg_game/';
export const STORY_CARD_WIDTH = 1080;
export const STORY_CARD_HEIGHT = 1920;
const STORY_CARD_LOGICAL_WIDTH = 720;
const STORY_CARD_LOGICAL_HEIGHT = 1280;

export interface ScoreShareData {
  rank: number;
  score: number;
  instagram: string;
  leaderboard: readonly LeaderboardEntry[];
}

export interface StoryLeaderboardRow {
  rank: number;
  instagram: string;
  score: number;
  isPlayer: boolean;
}

export type ScoreShareResult = 'file-shared' | 'text-shared' | 'copied' | 'prompted' | 'cancelled';

interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  clipboard?: { writeText(text: string): Promise<void> };
}

export interface ScoreShareDependencies {
  navigator: ShareNavigator;
  createCardFile?: (data: ScoreShareData) => Promise<File>;
  prompt?: (message: string, value: string) => void;
}

export function scoreShareText(data: ScoreShareData): string {
  return `I ranked #${data.rank} with ${data.score} points in HOLYWORLD. Can you beat my score?`;
}

function normalizedHandle(instagram: string): string {
  return instagram.replace(/^@/, '').toLowerCase();
}

/**
 * Selects only rows actually present in the claimed response. A player in
 * Top 10 gets a five-row neighborhood; an outside player gets their own row
 * plus available leaders because the API did not return invented neighbors.
 */
export function selectStoryLeaderboardRows(data: ScoreShareData): StoryLeaderboardRow[] {
  const playerHandle = normalizedHandle(data.instagram);
  const seen = new Set<string>();
  const available: StoryLeaderboardRow[] = [];

  data.leaderboard.forEach((entry, index) => {
    const handle = normalizedHandle(entry.instagram);
    if (!handle || seen.has(handle)) return;
    seen.add(handle);
    const isPlayer = handle === playerHandle;
    available.push({
      rank: isPlayer ? data.rank : index + 1,
      instagram: handle,
      score: isPlayer ? data.score : entry.bestScore,
      isPlayer,
    });
  });

  const playerIndex = available.findIndex((row) => row.isPlayer);
  if (playerIndex >= 0) {
    const start = Math.min(
      Math.max(0, playerIndex - 2),
      Math.max(0, available.length - 5),
    );
    return available.slice(start, start + 5);
  }

  const rows = available.slice(0, 4);
  rows.push({
    rank: data.rank,
    instagram: playerHandle,
    score: data.score,
    isPlayer: true,
  });
  return rows.sort((left, right) => left.rank - right.rank);
}

function isShareCancellation(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/**
 * Progressive web-only sharing: an image File where Web Share Level 2 is
 * supported, ordinary text+URL sharing everywhere else, then clipboard.
 */
export async function shareScoreResult(
  data: ScoreShareData,
  dependencies: ScoreShareDependencies,
): Promise<ScoreShareResult> {
  const text = scoreShareText(data);
  const payload = { title: 'HOLYWORLD score', text, url: HOLYWORLD_GAME_URL };
  const share = dependencies.navigator.share?.bind(dependencies.navigator);

  if (share && dependencies.navigator.canShare && dependencies.createCardFile) {
    try {
      const file = await dependencies.createCardFile(data);
      const filePayload: ShareData = { ...payload, files: [file] };
      if (dependencies.navigator.canShare(filePayload)) {
        await share(filePayload);
        return 'file-shared';
      }
    } catch (error) {
      if (isShareCancellation(error)) return 'cancelled';
      // Image creation or file sharing can fail independently. The ordinary
      // Web Share payload below remains useful and must still be attempted.
    }
  }

  if (share) {
    try {
      await share(payload);
      return 'text-shared';
    } catch (error) {
      if (isShareCancellation(error)) return 'cancelled';
    }
  }

  const copyText = `${text} ${HOLYWORLD_GAME_URL}`;
  try {
    if (dependencies.navigator.clipboard) {
      await dependencies.navigator.clipboard.writeText(copyText);
      return 'copied';
    }
  } catch {
    // A denied clipboard permission still leaves the explicit copy prompt.
  }
  dependencies.prompt?.('Copy your HOLYWORLD score', copyText);
  return 'prompted';
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.closePath();
}

function setFittedRowHandle(
  context: CanvasRenderingContext2D,
  handle: string,
  maxWidth: number,
): void {
  let size = 21;
  do {
    context.font = `bold ${size}px "Space Mono", monospace`;
    if (context.measureText(handle).width <= maxWidth || size === 13) return;
    size -= 1;
  } while (size >= 13);
}

/** Creates a 1080x1920 (9:16) PNG suitable for Instagram Story share sheets. */
export async function createBrandedScoreCard(data: ScoreShareData): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = STORY_CARD_WIDTH;
  canvas.height = STORY_CARD_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  const scale = STORY_CARD_WIDTH / STORY_CARD_LOGICAL_WIDTH;
  context.scale(scale, scale);

  const gradient = context.createLinearGradient(0, 0, STORY_CARD_LOGICAL_WIDTH, STORY_CARD_LOGICAL_HEIGHT);
  gradient.addColorStop(0, '#080a07');
  gradient.addColorStop(0.58, '#12140f');
  gradient.addColorStop(1, '#071006');
  context.fillStyle = gradient;
  context.fillRect(0, 0, STORY_CARD_LOGICAL_WIDTH, STORY_CARD_LOGICAL_HEIGHT);

  context.strokeStyle = '#39ff14';
  context.lineWidth = 8;
  roundedRect(context, 34, 34, 652, 1212, 28);
  context.stroke();

  context.globalAlpha = 0.18;
  context.strokeStyle = '#aaff33';
  context.lineWidth = 2;
  for (let y = 150; y < 1180; y += 54) {
    context.beginPath();
    context.moveTo(66, y);
    context.lineTo(654, y + 34);
    context.stroke();
  }
  context.globalAlpha = 1;

  context.textAlign = 'center';
  context.fillStyle = '#39ff14';
  context.font = 'bold 72px "Arcade Classic", "Archivo Black", sans-serif';
  context.fillText('HOLYWORLD', 360, 170);

  context.fillStyle = '#93a191';
  context.font = 'bold 30px "Space Mono", monospace';
  context.fillText('GLOBAL LEADERBOARD', 360, 230);

  context.fillStyle = '#eef5ea';
  context.font = 'bold 27px "Space Mono", monospace';
  context.fillText('MY TOTAL SCORE', 360, 306);
  context.fillStyle = '#39ff14';
  context.font = 'bold 82px "Space Mono", monospace';
  context.fillText(data.score.toLocaleString('en-US'), 360, 394);

  context.fillStyle = '#1b1f18';
  roundedRect(context, 70, 442, 580, 410, 26);
  context.fill();
  context.strokeStyle = '#1f7a10';
  context.lineWidth = 4;
  context.stroke();

  context.fillStyle = '#93a191';
  context.font = 'bold 22px "Space Mono", monospace';
  context.fillText('LEADERBOARD', 360, 487);

  const rows = selectStoryLeaderboardRows(data);
  rows.forEach((row, index) => {
    const rowY = 512 + index * 65;
    if (row.isPlayer) {
      context.fillStyle = '#39ff14';
      roundedRect(context, 88, rowY, 544, 55, 12);
      context.fill();
      context.fillStyle = '#071006';
    } else {
      context.fillStyle = index % 2 === 0 ? '#242820' : '#1b1f18';
      roundedRect(context, 88, rowY, 544, 55, 12);
      context.fill();
      context.fillStyle = '#d4ddd0';
    }

    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.font = 'bold 22px "Space Mono", monospace';
    context.fillText(`#${row.rank}`, 106, rowY + 28);
    const handle = `@${row.instagram}`;
    setFittedRowHandle(context, handle, row.isPlayer ? 265 : 250);
    context.fillText(handle, 177, rowY + 28, row.isPlayer ? 265 : 250);
    if (row.isPlayer) {
      context.font = 'bold 15px "Space Mono", monospace';
      context.fillText('YOU', 448, rowY + 28);
    }
    context.textAlign = 'right';
    context.font = 'bold 20px "Space Mono", monospace';
    context.fillText(row.score.toLocaleString('en-US'), 614, rowY + 28);
  });
  context.textBaseline = 'alphabetic';
  context.textAlign = 'center';

  context.fillStyle = '#eef5ea';
  context.font = 'bold 38px "Arcade Classic", "Archivo Black", sans-serif';
  context.fillText('CAN YOU BEAT MY SCORE?', 360, 960);

  context.fillStyle = '#93a191';
  context.font = '24px "Space Mono", monospace';
  context.fillText('PLAY NOW', 360, 1080);
  context.fillStyle = '#aaff33';
  context.font = 'bold 23px "Space Mono", monospace';
  context.fillText(STORY_CARD_GAME_URL, 360, 1130);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('Score card could not be encoded'));
    }, 'image/png');
  });
  return new File([blob], 'holyworld-score.png', { type: 'image/png' });
}
