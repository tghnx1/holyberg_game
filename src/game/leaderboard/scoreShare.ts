export const HOLYWORLD_GAME_URL = 'https://tghnx1.github.io/holyberg_game/';

export interface ScoreShareData {
  rank: number;
  score: number;
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

/** Creates a compact 720x1280 (9:16) PNG suitable for mobile share sheets. */
export async function createBrandedScoreCard(data: ScoreShareData): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');

  const gradient = context.createLinearGradient(0, 0, 720, 1280);
  gradient.addColorStop(0, '#080a07');
  gradient.addColorStop(0.58, '#12140f');
  gradient.addColorStop(1, '#071006');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 720, 1280);

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

  context.fillStyle = '#1b1f18';
  roundedRect(context, 94, 310, 532, 500, 26);
  context.fill();
  context.strokeStyle = '#1f7a10';
  context.lineWidth = 4;
  context.stroke();

  context.fillStyle = '#eef5ea';
  context.font = 'bold 34px "Space Mono", monospace';
  context.fillText('MY RANK', 360, 405);
  context.fillStyle = '#aaff33';
  context.font = 'bold 150px "Arcade Classic", "Archivo Black", sans-serif';
  context.fillText(`#${data.rank}`, 360, 570);

  context.fillStyle = '#eef5ea';
  context.font = 'bold 34px "Space Mono", monospace';
  context.fillText('SCORE', 360, 660);
  context.fillStyle = '#39ff14';
  context.font = 'bold 74px "Space Mono", monospace';
  context.fillText(data.score.toLocaleString('en-US'), 360, 752);

  context.fillStyle = '#eef5ea';
  context.font = 'bold 42px "Arcade Classic", "Archivo Black", sans-serif';
  context.fillText('CAN YOU BEAT', 360, 930);
  context.fillText('MY SCORE?', 360, 984);

  context.fillStyle = '#93a191';
  context.font = '24px "Space Mono", monospace';
  context.fillText('PLAY NOW', 360, 1092);
  context.fillStyle = '#aaff33';
  context.font = 'bold 23px "Space Mono", monospace';
  context.fillText(HOLYWORLD_GAME_URL, 360, 1140);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('Score card could not be encoded'));
    }, 'image/png');
  });
  return new File([blob], 'holyworld-score.png', { type: 'image/png' });
}
