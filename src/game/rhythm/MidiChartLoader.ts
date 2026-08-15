import { Midi } from '@tonejs/midi';
import { LANE_MIDI_NOTES } from './constants';
import type { RhythmChart, RhythmNote, TempoChange, TrackMetadata } from './types';

export interface ChartStatistics {
  duration: number;
  noteCount: number;
  laneCounts: readonly [number, number, number, number];
  firstNote: number | null;
  lastNote: number | null;
}

export type MidiWarningHandler = (message: string) => void;

function asMidiBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer | Uint8Array {
  if (value instanceof ArrayBuffer || value instanceof Uint8Array) return value;
  throw new Error('MIDI chart data is not a binary buffer');
}

export function parseMidiChart(
  value: ArrayBuffer | Uint8Array,
  metadata: TrackMetadata,
  warn: MidiWarningHandler = (message) => console.warn(message),
): RhythmChart {
  const midi = new Midi(asMidiBuffer(value));
  const unexpectedPitches = new Set<number>();
  const notes: RhythmNote[] = [];

  for (const track of midi.tracks) {
    for (const midiNote of track.notes) {
      const lane = LANE_MIDI_NOTES[midiNote.midi];
      if (lane === undefined) {
        unexpectedPitches.add(midiNote.midi);
        continue;
      }
      const time = midiNote.time + metadata.chartOffsetSeconds;
      if (time < 0) continue;
      notes.push({
        time,
        lane,
        duration: Math.max(0, midiNote.duration),
        velocity: midiNote.velocity,
      });
    }
  }
  notes.sort((left, right) => left.time - right.time || left.lane - right.lane);

  if (unexpectedPitches.size > 0) {
    warn(
      `[MidiChartLoader] ignored unmapped MIDI pitches: ${[...unexpectedPitches].sort((a, b) => a - b).join(', ')}`,
    );
  }

  const tempoChanges: TempoChange[] = (
    midi.header.tempos.length > 0 ? midi.header.tempos : [{ ticks: 0, bpm: 120 }]
  ).map((tempo) => ({
    ticks: tempo.ticks,
    time: midi.header.ticksToSeconds(tempo.ticks) + metadata.chartOffsetSeconds,
    bpm: tempo.bpm,
  }));
  const lastNoteEnd = notes.reduce((end, note) => Math.max(end, note.time + note.duration), 0);

  return {
    title: metadata.title,
    artist: metadata.artist,
    bpm: tempoChanges[0]?.bpm ?? 120,
    ppq: midi.header.ppq,
    duration: Math.max(midi.duration + metadata.chartOffsetSeconds, lastNoteEnd),
    preRoll: metadata.preRollSeconds,
    tempoChanges,
    notes,
  };
}

export function getChartStatistics(chart: RhythmChart): ChartStatistics {
  const laneCounts: [number, number, number, number] = [0, 0, 0, 0];
  for (const note of chart.notes) laneCounts[note.lane] += 1;
  return {
    duration: chart.duration,
    noteCount: chart.notes.length,
    laneCounts,
    firstNote: chart.notes[0]?.time ?? null,
    lastNote: chart.notes.at(-1)?.time ?? null,
  };
}

export function formatChartStatistics(chart: RhythmChart): string {
  const stats = getChartStatistics(chart);
  const formatTime = (value: number | null): string => (value === null ? 'n/a' : value.toFixed(3));
  return [
    `Track duration: ${stats.duration.toFixed(2)}s`,
    `Notes: ${stats.noteCount}`,
    '',
    ...stats.laneCounts.map((count, lane) => `Lane ${lane}: ${count}`),
    '',
    `First note: ${formatTime(stats.firstNote)}`,
    `Last note: ${formatTime(stats.lastNote)}`,
  ].join('\n');
}

export function getBeatIndexAtTime(chart: RhythmChart, songTime: number): number {
  if (songTime <= 0) return 0;
  let beats = 0;
  let previousTime = 0;
  let bpm = chart.tempoChanges[0]?.bpm ?? chart.bpm;
  for (const tempo of chart.tempoChanges.slice(1)) {
    if (tempo.time >= songTime) break;
    beats += Math.max(0, tempo.time - previousTime) * (bpm / 60);
    previousTime = tempo.time;
    bpm = tempo.bpm;
  }
  beats += Math.max(0, songTime - previousTime) * (bpm / 60);
  return Math.floor(beats);
}
