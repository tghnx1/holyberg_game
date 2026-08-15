# MIDI rhythm engine

## Content pipeline

```text
Ableton
  -> curated GAME_CHART MIDI clip
  -> chart.mid
  -> MidiChartLoader
  -> RhythmNote[]
  -> RhythmEngine
  -> RhythmScene renderer
```

The browser does not analyze audio and does not generate difficulty variants. Every registered track has one authored MIDI chart.

## Track layout

Each track is self-contained:

```text
public/tracks/<track-id>/
  audio.mp3 (or audio.wav)
  chart.mid
  metadata.json
```

`metadata.json` uses this shape:

```json
{
  "id": "track-02",
  "title": "Holyberg Track 02",
  "artist": "Holyberg",
  "audio": "audio.mp3",
  "chart": "chart.mid",
  "preRollSeconds": 2,
  "chartOffsetSeconds": 0
}
```

`preRollSeconds` sets the minimum note look-ahead/travel window and is also an authoring guarantee: keep the first playable note at or after that timestamp so it has time to approach after audio starts. MIDI times remain ordinary audio-relative seconds and are not shifted by pre-roll. `chartOffsetSeconds` applies an explicit signed sync correction to every MIDI event when an export needs it.

## Adding a track

1. Export project-owned MP3 or WAV audio from Ableton.
2. Export the single curated `GAME_CHART` MIDI clip, including its tempo map.
3. Put the audio and `chart.mid` in `public/tracks/<track-id>/`.
4. Add `metadata.json` using the actual filenames.
5. Register the directory and audio filename in `src/game/rhythm/TrackRegistry.ts`.
6. Run `npm run dev`; development mode prints parsed chart statistics to the console.

No rhythm-engine code changes are required when swapping the `main` registry entry.

## MIDI lane mapping

The mapping is centralized in `src/game/rhythm/constants.ts` and uses MIDI numbers, not note-name strings.

| MIDI number | Ableton label | @tonejs/midi label | Lane | Input |
| ---: | --- | --- | ---: | --- |
| 36 | C1 | C2 | 0 | D |
| 38 | D1 | D2 | 1 | F |
| 40 | E1 | E2 | 2 | J |
| 41 | F1 | F2 | 3 | K |

Ableton and `@tonejs/midi` use different octave-name conventions. The numeric values above are authoritative. Unmapped notes are ignored; development builds report their MIDI numbers so export mistakes are visible.

`@tonejs/midi` converts note ticks through the file's PPQ and complete tempo map. The resulting internal note `time` and `duration` values are seconds from audio start, including files with tempo changes.

## Timing architecture

The track is decoded into an `AudioBuffer`. Playback and `RhythmClock` share the same `AudioContext` and scheduled source origin:

```text
song time = AudioContext.currentTime - scheduled audio origin
note progress = note.time - song time
```

Phaser frame delta is never accumulated into song time or note position. Suspending the scene suspends the audio context, so the audio and chart clock pause together.

The player gesture before the tutorial resumes the context. If the browser suspends it again, the countdown ends on a `TAP TO START SET` recovery screen instead of starting a silent fallback clock.

Track completion requires both the audio-ended event and every chart note to be judged. Any still-pending note is marked missed when audio ends, exactly once.

## Judgement and score

Timing uses the absolute early/late difference:

| Judgement | Window | Base score |
| --- | ---: | ---: |
| PERFECT | up to 60 ms | 100 |
| GOOD | up to 120 ms | 70 |
| OK | up to 180 ms | 40 |
| MISS | over 180 ms | 0 |

Combo multipliers are x1 at 0-9, x2 at 10-24, x3 at 25-49, and x4 at 50+. Raw combo-weighted points are normalized against the chart's theoretical all-PERFECT score, so every chart has the same 7,500-point maximum regardless of note count. MISS awards zero and never removes earned score. Accuracy is earned base judgement points divided by 100 points per judged chart note. Grade thresholds are S at 95%, A at 90%, B at 80%, C at 70%, and D below 70%.

## Calibration and debug

Judgement uses:

```text
effective song time = audio song time + inputOffsetMs / 1000
```

The default is zero. A future calibration screen can save a numeric value under local-storage key `holyberg.rhythm.inputOffsetMs`; `Calibration.ts` already validates and reads it.

In development builds, press R to toggle song time, next note, last timing difference, active object count, FPS, input offset, and judged/chart note count. Press T for the existing touch-zone geometry overlay.

## Held notes

MIDI note duration is retained in every `RhythmNote`. The first version judges and renders all notes as taps; sustain-tail rendering and key-release scoring are intentionally deferred without losing authored duration data.

## Development fixture

`public/tracks/development-track` is clearly non-production content. It is an original generated click track used to exercise loading and gameplay before the final Ableton export arrives. Run `npm run generate:rhythm-fixture` to regenerate its WAV and MIDI files.
