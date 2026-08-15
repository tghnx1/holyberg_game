import type { TrackDefinition } from './types';

const defineTrack = (id: string, audioFile: string): TrackDefinition => {
  const root = `tracks/${id}`;
  return {
    id,
    metadataUrl: `${root}/metadata.json`,
    audioUrl: `${root}/${audioFile}`,
    midiUrl: `${root}/chart.mid`,
  };
};

export const TRACKS = {
  // Replace this registry entry when the production Ableton export arrives.
  main: defineTrack('development-track', 'audio.wav'),
} as const satisfies Record<string, TrackDefinition>;

export const MAIN_RHYTHM_TRACK: TrackDefinition = TRACKS.main;
