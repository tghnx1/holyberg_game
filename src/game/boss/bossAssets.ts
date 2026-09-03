/** Canonical, demand-loaded artwork for the existing boss fight. */

/**
 * Which way the boss is *looking*, from the fight's point of view.
 *
 * Deliberately not the name of an asset folder. The `baby/left` artwork is a
 * body turned to its own right, and `baby/right` the mirror of that, so the
 * folder names read as the doll's own left and right rather than the screen's
 * — following them literally had the boss stare away from the player. The
 * folders are the delivered artwork and stay as they are; `BABY_FACING_FOLDER`
 * is where the two spaces are reconciled, once.
 */
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
  /** Visible energy core centre within its shared 859x864 authored canvas. */
  energyArtworkCenterOffsetX: 2.5,
  energyArtworkCenterOffsetY: -7,
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

/** Screen-space facing to the artwork that actually looks that way. */
const BABY_FACING_FOLDER: Record<BossFacing, keyof typeof BOSS_ART.baby> = {
  left: 'right',
  front: 'front',
  right: 'left',
};

/** The four frames that visually face `facing`, whatever they are filed under. */
export function getBossBabyFrames(facing: BossFacing): readonly BossImageAsset[] {
  return BOSS_ART.baby[BABY_FACING_FOLDER[facing]];
}

/**
 * How the boss decides where to look.
 *
 * `frontZonePx` is a real band, not the vanishing case of an exact match: the
 * boss is about 280px wide on screen, so a player anywhere within ~110px of
 * its centre is genuinely underneath it and a turned pose would read as
 * looking past them.
 *
 * `hysteresisPx` is what stops the pose stuttering. Walking slowly across a
 * bare threshold re-decides the facing every frame; requiring a little more
 * distance to leave a zone than to enter it means the boss commits to a pose
 * and holds it until the player has clearly moved on.
 */
export const BOSS_FACING = {
  frontZonePx: 110,
  hysteresisPx: 26,
} as const;

/**
 * The ordinary battle pose, from the player's position and the pose already
 * held. `previous` is what makes this sticky; passing the boss's own current
 * facing back in is the intended use.
 */
export function resolveBossFacing(
  playerX: number,
  bossX: number,
  previous: BossFacing = 'front',
): BossFacing {
  const offset = playerX - bossX;
  const zone =
    previous === 'front'
      ? BOSS_FACING.frontZonePx + BOSS_FACING.hysteresisPx
      : BOSS_FACING.frontZonePx;
  if (Math.abs(offset) <= zone) return 'front';
  return offset < 0 ? 'left' : 'right';
}

/** Applies the boss container transform to a child-local visual anchor. */
export function resolveAttachedBossPoint(
  local: { x: number; y: number },
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  },
): { x: number; y: number } {
  const scaledX = local.x * transform.scaleX;
  const scaledY = local.y * transform.scaleY;
  const cosine = Math.cos(transform.rotation);
  const sine = Math.sin(transform.rotation);
  return {
    x: transform.x + scaledX * cosine - scaledY * sine,
    y: transform.y + scaledX * sine + scaledY * cosine,
  };
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
