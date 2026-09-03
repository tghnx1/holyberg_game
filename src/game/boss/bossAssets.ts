/** Canonical, demand-loaded artwork for the existing boss fight. */

export type BossFacing = 'left' | 'front' | 'right';

export interface BossImageAsset {
  key: string;
  url: string;
}

const ASSET_ROOT = 'assets/boss';
const FRAME_COUNT = 4;

function frameSequence(group: string): BossImageAsset[] {
  return Array.from({ length: FRAME_COUNT }, (_, index) => {
    const frame = String(index + 1).padStart(2, '0');
    return {
      key: `boss-${group}-${frame}`,
      url: `${ASSET_ROOT}/${group}/${frame}.png`,
    };
  });
}

export const BOSS_ART = {
  baby: {
    left: frameSequence('baby/left'),
    front: frameSequence('baby/front'),
    right: frameSequence('baby/right'),
  },
  energySphere: frameSequence('effects/energy-sphere'),
  laser: frameSequence('effects/laser').slice(0, 2),
  platform: {
    key: 'boss-environment-platform',
    url: `${ASSET_ROOT}/environment/platform.png`,
  },
} as const;

/**
 * Boss art is kept on one 859x864 transparent canvas, so frame changes preserve
 * its authored registration without per-frame offsets.
 */
export const BOSS_VISUAL = {
  sourceWidth: 859,
  sourceHeight: 864,
  scale: 0.36,
  spriteOffsetY: 38,
  animationCycleMs: 480,
  spawnFrameMs: 90,
  spawnDurationMs: 1250,
  spawnStartY: 840,
  spawnRotations: 1,
  energyCycleMs: 360,
  energyScale: 0.5,
} as const;

/** The platform's first non-transparent row, measured from the source PNG. */
export const BOSS_PLATFORM = {
  sourceWidth: 1672,
  visibleTopRow: 391,
} as const;

export function getBossAssetUrls(): BossImageAsset[] {
  return [
    ...BOSS_ART.baby.left,
    ...BOSS_ART.baby.front,
    ...BOSS_ART.baby.right,
    ...BOSS_ART.energySphere,
    ...BOSS_ART.laser,
    BOSS_ART.platform,
  ];
}

/** Resolves the ordinary battle pose directly from the player's position. */
export function resolveBossFacing(
  playerX: number,
  bossX: number,
): BossFacing {
  if (playerX < bossX) return 'left';
  if (playerX > bossX) return 'right';
  return 'front';
}

export function loopedBossFrameIndex(elapsedMs: number, cycleMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || cycleMs <= 0) return 0;
  return Math.floor(((elapsedMs % cycleMs) / cycleMs) * FRAME_COUNT) % FRAME_COUNT;
}

export function getBossSpawnFrame(elapsedMs: number): {
  facing: Extract<BossFacing, 'left' | 'right'>;
  frameIndex: number;
} {
  const step = Math.max(0, Math.floor(elapsedMs / BOSS_VISUAL.spawnFrameMs));
  return {
    facing: step % 2 === 0 ? 'left' : 'right',
    frameIndex: step % FRAME_COUNT,
  };
}
