import type { MovingPlatformConfig, PlatformConfig } from './types';
import { GROUND_Y } from '../../constants';

export type PlatformTextureKey =
  | 'platform-1'
  | 'platform-2'
  | 'platform-3'
  | 'platform-4'
  | 'platform-5'
  | 'platform-6';

interface PlatformTextureMetrics {
  key: PlatformTextureKey;
  url: string;
  sourceWidth: number;
  sourceHeight: number;
  deckLeft: number;
  deckRight: number;
  /** Source-image row of the visible walkable deck surface. */
  surfaceY: number;
  /** Last source-image row belonging to the platform slab/deck. */
  deckBottomY: number;
}

export interface PlatformVisualLayout {
  textureKey: PlatformTextureKey;
  /** Legacy alias for horizontal scale. */
  scale: number;
  scaleX: number;
  scaleY: number;
  imageX: number;
  imageY: number;
  visibleDeckWidth: number;
  visibleDeckThickness: number;
  visibleSurfaceY: number;
}

export interface PlatformSupportPiece {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  color: number;
  alpha: number;
}

/** Measured from the original PNG alpha bounds; source files remain untouched. */
export const PLATFORM_TEXTURES: readonly PlatformTextureMetrics[] = [
  {
    key: 'platform-1',
    url: 'assets/images/platform_1.png',
    sourceWidth: 272,
    sourceHeight: 272,
    deckLeft: 80,
    deckRight: 257,
    surfaceY: 237,
    deckBottomY: 260,
  },
  {
    key: 'platform-2',
    url: 'assets/images/platform_2.png',
    sourceWidth: 140,
    sourceHeight: 136,
    deckLeft: 23,
    deckRight: 121,
    surfaceY: 101,
    deckBottomY: 124,
  },
  {
    key: 'platform-3',
    url: 'assets/images/platform_3.png',
    sourceWidth: 240,
    sourceHeight: 240,
    deckLeft: 38,
    deckRight: 215,
    surfaceY: 205,
    deckBottomY: 228,
  },
  {
    key: 'platform-4',
    url: 'assets/images/platform_4.png',
    sourceWidth: 152,
    sourceHeight: 152,
    deckLeft: 26,
    deckRight: 135,
    surfaceY: 100,
    deckBottomY: 122,
  },
  {
    key: 'platform-5',
    url: 'assets/images/platform_5.png',
    sourceWidth: 147,
    sourceHeight: 147,
    deckLeft: 19,
    deckRight: 131,
    surfaceY: 73,
    deckBottomY: 95,
  },
  {
    key: 'platform-6',
    url: 'assets/images/platform_6.png',
    sourceWidth: 277,
    sourceHeight: 277,
    deckLeft: 55,
    deckRight: 232,
    surfaceY: 193,
    deckBottomY: 215,
  },
] as const;

const PLATFORM_TEXTURE_BY_ID: Readonly<Record<string, PlatformTextureKey>> = {
  'early-moving-platform-1': 'platform-1',
  'early-moving-platform-2': 'platform-3',
  'platform-1': 'platform-6',
  'platform-2': 'platform-2',
  'platform-3': 'platform-4',
  'platform-4': 'platform-5',
  'platform-5': 'platform-1',
  'platform-6': 'platform-3',
  'final-moving-platform-1': 'platform-6',
  'final-moving-platform-2': 'platform-2',
  'final-moving-platform-3': 'platform-4',
  'final-moving-platform-5': 'platform-5',
};

const METRICS_BY_KEY = new Map(PLATFORM_TEXTURES.map((metrics) => [metrics.key, metrics]));

export function getPlatformTextureAssets(): Array<{ key: PlatformTextureKey; url: string }> {
  return PLATFORM_TEXTURES.map(({ key, url }) => ({ key, url }));
}

/**
 * Uses one uniform scale and aligns the measured deck surface to the unchanged
 * physics `topY`. The sprite can therefore move independently with its zone
 * while preserving the authored PNG proportions and transparent padding.
 */
export function getPlatformVisualLayout(
  entity: PlatformConfig | MovingPlatformConfig,
): PlatformVisualLayout | undefined {
  const textureKey = PLATFORM_TEXTURE_BY_ID[entity.id];
  if (!textureKey) return undefined;
  const metrics = METRICS_BY_KEY.get(textureKey);
  if (!metrics) return undefined;

  const deckWidth = metrics.deckRight - metrics.deckLeft + 1;
  const deckCenterX = (metrics.deckLeft + metrics.deckRight + 1) / 2;
  const deckThickness = metrics.deckBottomY - metrics.surfaceY + 1;
  const scaleX = entity.width / deckWidth;
  // Existing layouts authored before visual resize support retain their
  // original uniform PNG scale. Once resized, explicit height controls Y.
  const scaleY = entity.editorSized ? entity.height / deckThickness : scaleX;
  const imageX = (metrics.sourceWidth / 2 - deckCenterX) * scaleX;
  const imageY =
    entity.topY - entity.y + (metrics.sourceHeight / 2 - metrics.surfaceY) * scaleY;

  return {
    textureKey,
    scale: scaleX,
    scaleX,
    scaleY,
    imageX,
    imageY,
    visibleDeckWidth: deckWidth * scaleX,
    visibleDeckThickness: deckThickness * scaleY,
    visibleSurfaceY:
      entity.y + imageY + (metrics.surfaceY - metrics.sourceHeight / 2) * scaleY,
  };
}

function supportSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number,
  color: number,
  alpha: number,
): PlatformSupportPiece {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return {
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2,
    width: Math.hypot(dx, dy),
    height: thickness,
    rotation: Math.atan2(dy, dx),
    color,
    alpha,
  };
}

/**
 * Adds a light urban frame below the authored platform art. Static platforms
 * are tied to the continuous street; moving platforms use a short mechanical
 * under-frame so their tween remains believable without a stretching support.
 */
export function getPlatformSupportLayout(
  entity: PlatformConfig | MovingPlatformConfig,
  layout = getPlatformVisualLayout(entity),
): PlatformSupportPiece[] {
  if (!layout) return [];

  const dark = 0x21162c;
  const accent = entity.type === 'movingPlatform' ? 0xf29b38 : 0x31b9cc;
  const surfaceLocalY = entity.topY - entity.y;
  const frameTop = surfaceLocalY + Math.min(48, Math.max(28, layout.visibleDeckThickness * 0.75));
  const frameBottom =
    entity.type === 'platform' ? GROUND_Y - entity.y : frameTop + Math.min(78, entity.width * 0.24);
  const frameHeight = Math.max(28, frameBottom - frameTop);
  const leftX = -entity.width * 0.31;
  const rightX = entity.width * 0.31;
  const pieces: PlatformSupportPiece[] = [
    {
      x: leftX,
      y: frameTop + frameHeight / 2,
      width: 10,
      height: frameHeight,
      color: dark,
      alpha: 0.96,
    },
    {
      x: rightX,
      y: frameTop + frameHeight / 2,
      width: 10,
      height: frameHeight,
      color: dark,
      alpha: 0.96,
    },
    {
      x: 0,
      y: frameTop + 3,
      width: entity.width * 0.72,
      height: 9,
      color: accent,
      alpha: 0.7,
    },
  ];

  const bayHeight = Math.min(72, frameHeight);
  for (let bayTop = frameTop + 8; bayTop < frameBottom - 12; bayTop += bayHeight) {
    const bayBottom = Math.min(frameBottom - 5, bayTop + bayHeight);
    pieces.push(
      supportSegment(leftX, bayTop, rightX, bayBottom, 5, dark, 0.78),
      supportSegment(rightX, bayTop, leftX, bayBottom, 5, dark, 0.78),
      {
        x: 0,
        y: bayBottom,
        width: entity.width * 0.64,
        height: 5,
        color: accent,
        alpha: 0.42,
      },
    );
  }

  return pieces;
}
