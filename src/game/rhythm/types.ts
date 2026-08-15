export type Lane = 0 | 1 | 2 | 3;
export type Judgement = 'PERFECT' | 'GOOD' | 'OK' | 'MISS';
export type NoteState = 'pending' | 'hit' | 'missed';

export interface RhythmNote {
  /** Seconds from the start of the audio file. */
  time: number;
  lane: Lane;
  /** MIDI note duration in seconds. Holds render as taps for now. */
  duration: number;
  velocity: number;
}

export interface RhythmChart {
  title: string;
  artist: string;
  bpm: number;
  ppq: number;
  duration: number;
  preRoll: number;
  tempoChanges: TempoChange[];
  notes: RhythmNote[];
}

export interface TempoChange {
  ticks: number;
  time: number;
  bpm: number;
}

export interface RuntimeRhythmNote extends RhythmNote {
  id: number;
  state: NoteState;
}

export interface TrackDefinition {
  id: string;
  metadataUrl: string;
  audioUrl: string;
  midiUrl: string;
}

export interface TrackMetadata {
  id: string;
  title: string;
  artist: string;
  audio: string;
  chart: string;
  preRollSeconds: number;
  chartOffsetSeconds: number;
  startSeconds?: number;
  endSeconds?: number;
}

export interface ScoreState {
  score: number;
  rawScore: number;
  maximumRawScore: number;
  scorePenalty: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  ok: number;
  miss: number;
  badTap: number;
}

export interface RhythmResult extends ScoreState {
  berlinScore: number;
  accuracy: number;
  success: boolean;
}
