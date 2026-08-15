import { Midi } from '@tonejs/midi';
import { describe, expect, it, vi } from 'vitest';
import { parseMidiChart } from '../src/game/rhythm/MidiChartLoader';
import type { TrackMetadata } from '../src/game/rhythm/types';

const metadata: TrackMetadata = {
  id: 'test',
  title: 'Test Track',
  artist: 'Holyberg',
  audio: 'audio.wav',
  chart: 'chart.mid',
  preRollSeconds: 2,
  chartOffsetSeconds: 0,
};

function makeMidi(): Uint8Array {
  const midi = new Midi();
  midi.header.tempos = [
    { ticks: 0, bpm: 120 },
    { ticks: 480, bpm: 60 },
  ];
  midi.header.update();
  midi.addTrack()
    .addNote({ midi: 36, ticks: 0, durationTicks: 120 })
    .addNote({ midi: 38, ticks: 960, durationTicks: 240 })
    .addNote({ midi: 37, ticks: 1200, durationTicks: 120 });
  return midi.toArray();
}

describe('MidiChartLoader', () => {
  it('maps configured MIDI numbers and ignores unmapped pitches', () => {
    const warn = vi.fn();
    const chart = parseMidiChart(makeMidi(), metadata, warn);
    expect(chart.notes.map((note) => note.lane)).toEqual([0, 1]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('37'));
  });

  it('converts ticks to seconds across tempo changes and preserves duration', () => {
    const chart = parseMidiChart(makeMidi(), metadata, () => undefined);
    expect(chart.ppq).toBe(480);
    expect(chart.notes[0].time).toBeCloseTo(0);
    expect(chart.notes[1].time).toBeCloseTo(1.5);
    expect(chart.notes[1].duration).toBeCloseTo(0.5);
    expect(chart.tempoChanges.map((tempo) => tempo.bpm)).toEqual([120, 60]);
  });
});
