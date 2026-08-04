export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;
export const WORLD_WIDTH = 7000;
export const GROUND_Y = 610;

export const RUN_SPEED = 300;
export const JUMP_VELOCITY = -650;
export const START_TIME = 40;
export const HIT_TIME = 3;
export const HIT_SCORE = 100;
export const USB_SCORE = 500;

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
