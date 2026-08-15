import type { RhythmNote } from './types';

export interface RhythmPlaybackWindow {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  fadeOutSeconds: number;
}

const DEFAULT_FADE_OUT_SECONDS = 0.25;

function requireFiniteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Rhythm playback window field "${field}" must be a non-negative finite number`);
  }
  return value;
}

export function resolveRhythmPlaybackWindow(
  metadata: { startSeconds?: number; endSeconds?: number },
  audioDurationSeconds: number,
): RhythmPlaybackWindow {
  const trackDuration = requireFiniteNonNegative(audioDurationSeconds, 'audioDurationSeconds');
  const startSeconds = requireFiniteNonNegative(metadata.startSeconds ?? 0, 'startSeconds');
  const endSeconds = requireFiniteNonNegative(metadata.endSeconds ?? trackDuration, 'endSeconds');
  const clampedStart = Math.min(startSeconds, trackDuration);
  const clampedEnd = Math.min(endSeconds, trackDuration);
  if (clampedEnd <= clampedStart) {
    throw new Error('Rhythm playback window endSeconds must be greater than startSeconds');
  }
  const durationSeconds = clampedEnd - clampedStart;
  return {
    startSeconds: clampedStart,
    endSeconds: clampedEnd,
    durationSeconds,
    fadeOutSeconds: Math.min(DEFAULT_FADE_OUT_SECONDS, durationSeconds / 2),
  };
}

export function selectRhythmNotesInWindow(
  notes: readonly RhythmNote[],
  startSeconds: number,
  endSeconds: number,
): RhythmNote[] {
  return notes.filter((note) => note.time >= startSeconds && note.time < endSeconds);
}

export function getRhythmPlaybackProgress(
  songTime: number,
  startSeconds: number,
  endSeconds: number,
): number {
  if (endSeconds <= startSeconds) return 1;
  return Math.min(1, Math.max(0, (songTime - startSeconds) / (endSeconds - startSeconds)));
}
