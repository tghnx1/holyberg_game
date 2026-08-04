export const LANE_COUNT = 4;
export const PERFECT_WINDOW_MS = 70;
export const EXCELLENT_WINDOW_MS = 130;
export const GOOD_WINDOW_MS = 230;
export const MISS_WINDOW_MS = 300;
export const GLOBAL_INPUT_OFFSET_MS = 0;
export const SPAWN_AHEAD_MS = 2200;
export const NOTE_TRAVEL_MS = 2500;
export const CROWD_ENERGY_MIN = 20;
export const CROWD_ENERGY_MAX = 100;
export const INITIAL_ENERGY = 80;
export const BEGINNER_GRACE_MS = 10000;
export const END_GRACE_MS = 800;
export const PAD_TOP_Y = 600;
export const PAD_BOTTOM_Y = 690;
export const LANE_INPUT_COOLDOWN_MS = 80;
export const BAD_TAP_SCORE_PENALTY = 40;
export const MASH_WINDOW_MS = 1000;
export const MASH_THRESHOLD = 6;
export const MASH_LOCK_MS = 1200;
export const LANE_LABELS = ['D', 'F', 'J', 'K'] as const;
export const LANE_COLORS = [0xff8a3d, 0xff477e, 0x9d6cff, 0xffdd57] as const;
export const HORIZON_Y = 170;
export const HIT_LINE_Y = 590;
export const HORIZON_HALF_WIDTH = 105;
export const HIT_LINE_HALF_WIDTH = 390;

export const RhythmDepth = {
  CLUB_BACKGROUND: 0,
  CROWD_BACK: 10,
  HIGHWAY: 50,
  NOTES: 100,
  JUDGEMENT_EFFECTS: 150,
  CROWD_FRONT: 200,
  UI: 1000,
} as const;
