export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;
export const WORLD_WIDTH = 15500;
export const GROUND_Y = 610;

export const RUN_SPEED = 260;
export const HIT_KNOCKBACK_SPEED = -180;
export const HIT_KNOCKBACK_DURATION = 140;
export const HIT_SLOW_SPEED = 120;
export const HIT_SLOW_DURATION = 1000;
export const HIT_INPUT_LOCK_MS = 250;
export const JUMP_VELOCITY = -720;
export const START_TIME = 65;
export const HIT_TIME = 3;
export const HIT_SCORE = 100;
/** Every Level 1 collectible is an Emerald and is worth exactly this. */
export const EMERALD_SCORE = 250;

export const Depth = {
  SKY: 0,
  FAR_BACKGROUND: 10,
  MID_BACKGROUND: 20,
  ENVIRONMENT: 50,
  GAMEPLAY: 100,
  PLAYER: 150,
  COLLECTIBLES: 160,
  FOREGROUND: 200,
  UI: 1000,
} as const;
