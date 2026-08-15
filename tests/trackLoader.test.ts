import { describe, expect, it } from 'vitest';
import { parseTrackMetadata } from '../src/game/rhythm/TrackLoader';
import type { TrackDefinition } from '../src/game/rhythm/types';

const definition: TrackDefinition = {
  id: 'track_1',
  metadataUrl: 'tracks/track_1/metadata.json',
  audioUrl: 'tracks/track_1/audio.mp3',
  midiUrl: 'tracks/track_1/chart.mid',
};

describe('TrackLoader', () => {
  it('parses optional playback window bounds', () => {
    expect(
      parseTrackMetadata(
        {
          id: 'track_1',
          title: 'Track',
          artist: 'Artist',
          audio: 'audio.mp3',
          chart: 'chart.mid',
          preRollSeconds: 2,
          chartOffsetSeconds: 0,
          startSeconds: 12.5,
          endSeconds: 27,
        },
        definition,
      ),
    ).toMatchObject({
      startSeconds: 12.5,
      endSeconds: 27,
    });
  });
});
