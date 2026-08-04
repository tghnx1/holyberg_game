export type Lane = 0 | 1 | 2 | 3;
export type Judgement = 'PERFECT' | 'EXCELLENT' | 'GOOD' | 'MISS';
export type NoteState = 'pending' | 'hit' | 'missed';

export interface ChartNote {
  timeMs: number;
  lane: Lane;
}

export interface RhythmChart {
  title: string;
  bpm: number;
  offsetMs: number;
  durationMs: number;
  audioKey?: string;
  notes: ChartNote[];
}

export interface ScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  excellent: number;
  good: number;
  miss: number;
  badTap: number;
  energy: number;
}

export interface RhythmResult extends ScoreState {
  berlinScore: number;
  accuracy: number;
  success: boolean;
}
