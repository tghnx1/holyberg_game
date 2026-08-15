import type { TrackDefinition, TrackMetadata } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Track metadata field "${field}" must be a non-empty string`);
  }
  return value;
}

function optionalNonNegativeNumber(value: unknown, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Track metadata field "${field}" must be a non-negative number`);
  }
  return value;
}

function optionalOptionalNonNegativeNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Track metadata field "${field}" must be a non-negative number`);
  }
  return value;
}

function optionalFiniteNumber(value: unknown, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Track metadata field "${field}" must be a finite number`);
  }
  return value;
}

function optionalOptionalFiniteNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Track metadata field "${field}" must be a finite number`);
  }
  return value;
}

export function parseTrackMetadata(value: unknown, definition: TrackDefinition): TrackMetadata {
  if (!isRecord(value)) throw new Error('Track metadata must be an object');
  const metadata: TrackMetadata = {
    id: requireString(value.id, 'id'),
    title: requireString(value.title, 'title'),
    artist: requireString(value.artist, 'artist'),
    audio: requireString(value.audio, 'audio'),
    chart: requireString(value.chart, 'chart'),
    preRollSeconds: optionalNonNegativeNumber(value.preRollSeconds, 2, 'preRollSeconds'),
    chartOffsetSeconds: optionalFiniteNumber(
      value.chartOffsetSeconds,
      0,
      'chartOffsetSeconds',
    ),
    startSeconds: optionalOptionalNonNegativeNumber(value.startSeconds, 'startSeconds'),
    endSeconds: optionalOptionalFiniteNumber(value.endSeconds, 'endSeconds'),
  };

  if (metadata.id !== definition.id) {
    throw new Error(`Track metadata id "${metadata.id}" does not match registry id "${definition.id}"`);
  }
  if (!definition.audioUrl.endsWith(`/${metadata.audio}`)) {
    throw new Error(`Track registry audio URL does not match metadata audio "${metadata.audio}"`);
  }
  if (!definition.midiUrl.endsWith(`/${metadata.chart}`)) {
    throw new Error(`Track registry MIDI URL does not match metadata chart "${metadata.chart}"`);
  }
  return metadata;
}
