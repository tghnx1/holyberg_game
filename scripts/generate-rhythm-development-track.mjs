import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import toneMidi from '@tonejs/midi';

const { Midi } = toneMidi;

const outputDirectory = new URL('../public/tracks/development-track/', import.meta.url);
const sampleRate = 22050;
const durationSeconds = 13;
const laneMidiNotes = [36, 38, 40, 41];
const laneFrequencies = [220, 277.18, 329.63, 392];
const chartNotes = Array.from({ length: 20 }, (_, index) => ({
  time: 2 + index * 0.5,
  lane: [0, 1, 2, 3, 1, 3, 0, 2][index % 8],
}));

function createMidi() {
  const midi = new Midi();
  midi.name = 'Holyberg development chart';
  midi.header.tempos = [{ ticks: 0, bpm: 120 }];
  midi.header.update();
  const track = midi.addTrack();
  track.name = 'GAME_CHART';
  for (const note of chartNotes) {
    track.addNote({
      midi: laneMidiNotes[note.lane],
      ticks: Math.round(note.time * 960),
      durationTicks: 96,
      velocity: 0.9,
    });
  }
  return midi.toArray();
}

function createWave() {
  const sampleCount = sampleRate * durationSeconds;
  const dataBytes = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeText = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const time = sample / sampleRate;
    let signal = 0;
    for (const note of chartNotes) {
      const elapsed = time - note.time;
      if (elapsed < 0 || elapsed > 0.11) continue;
      const envelope = Math.exp(-elapsed * 34);
      signal += Math.sin(2 * Math.PI * laneFrequencies[note.lane] * elapsed) * envelope * 0.55;
    }
    const beatElapsed = time - Math.floor(time);
    if (time >= 2 && beatElapsed < 0.15) {
      const kickFrequency = 75 - beatElapsed * 180;
      signal += Math.sin(2 * Math.PI * kickFrequency * beatElapsed) * Math.exp(-beatElapsed * 22) * 0.45;
    }
    const clamped = Math.max(-1, Math.min(1, signal));
    view.setInt16(44 + sample * 2, Math.round(clamped * 32767), true);
  }
  return new Uint8Array(buffer);
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(new URL('chart.mid', outputDirectory), createMidi()),
  writeFile(new URL('audio.wav', outputDirectory), createWave()),
]);
