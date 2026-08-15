import type { Lane } from './types';

export const PERFECT_WINDOW_MS = 60;
export const GOOD_WINDOW_MS = 120;
export const OK_WINDOW_MS = 180;
export const MAX_HIT_WINDOW_MS = OK_WINDOW_MS;
export const DEFAULT_INPUT_OFFSET_MS = 0;
export const INPUT_OFFSET_STORAGE_KEY = 'holyberg.rhythm.inputOffsetMs';
export const SPAWN_AHEAD_SECONDS = 3;
export const NOTE_TRAVEL_SECONDS = 3;
export const RHYTHM_SCORE_CAP = 7500;
export const PAD_TOP_Y = 470;
export const PAD_BOTTOM_Y = 540;
export const LANE_INPUT_COOLDOWN_MS = 200;
export const BAD_TAP_SCORE_PENALTY = 40;
export const MASH_WINDOW_MS = 1000;
export const MASH_THRESHOLD = 6;
export const MASH_LOCK_MS = 1200;
export const LANE_LABELS = ['D', 'F', 'J', 'K'] as const;
export const LANE_COLORS = [0xff8a3d, 0xff477e, 0x9d6cff, 0xffdd57] as const;
/** Ableton labels these C1/D1/E1/F1; @tonejs/midi calls MIDI 36 C2. */
export const LANE_MIDI_NOTES: Readonly<Record<number, Lane>> = {
  36: 0,
  38: 1,
  40: 2,
  41: 3,
};
export const HORIZON_Y = 150;
export const HIT_LINE_Y = 460;
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
