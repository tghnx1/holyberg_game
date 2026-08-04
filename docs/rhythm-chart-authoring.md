# Rhythm chart authoring

Charts live in `public/charts` and contain metadata plus a `notes` array:

```json
{
  "title": "My Original Set",
  "bpm": 124,
  "offsetMs": 500,
  "durationMs": 35000,
  "audioKey": "my-track",
  "notes": [{ "timeMs": 1000, "lane": 0 }]
}
```

`timeMs` is the absolute intended hit position measured from audio playback start. Lanes are 0 = D/Left, 1 = F/Down, 2 = J/Up, and 3 = K/Right. Invalid notes are ignored safely and valid notes are sorted by time.

To chart manually, place easy notes on beat positions, play-test them, and adjust their millisecond values against the original audio. BPM describes the beat grid. `offsetMs` describes where the first musical grid beat begins; neither field silently changes note timestamps.

To replace the demo, add an original licensed audio asset, preload it under the chart's `audioKey`, update duration and notes, and load the new JSON in RhythmScene. A future editor can render the BPM grid, play/scrub the same audio clock, insert lane notes at the playhead, quantize them, and export this unchanged JSON format.
