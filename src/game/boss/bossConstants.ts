/** Render-order and palette constants for the Level 3 arena. */
export const BossDepth = {
  BACKDROP: 0,
  ARENA: 10,
  TELEGRAPH: 40,
  BOSS: 60,
  LASER: 80,
  PLAYER: 100,
  UI: 1000,
} as const;

export const BossPalette = {
  background: '#0b0518',
  floor: 0x2a1440,
  wall: 0x4a1f63,
  telegraph: 0xffdf57,
  laser: 0xff477e,
  laserCore: 0xffffff,
  safeGap: 0x56ffff,
  phaseTints: [0x2a1140, 0x3a1030, 0x481038, 0x5a0f2a],
} as const;
