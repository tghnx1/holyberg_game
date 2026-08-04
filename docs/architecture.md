# Architecture

## Audio-clock synchronization

Each chart note has an absolute `timeMs`. After a user gesture unlocks Web Audio, the countdown starts the procedural beat and `RhythmClock` at the same origin. Rendering computes note progress from the audio context time, preventing frame-rate drift.

## 2.5D perspective

The highway is a Phaser-drawn trapezoid. Pure `getPerspectivePosition` converts time progress into an eased Y coordinate, interpolates the highway half-width between horizon and judgement line, applies a normalized lane offset, and scales each note from 0.2 to 1.2. No 3D renderer is involved.

## Note lifecycle

`NoteManager` holds lightweight chart data and spawns a Phaser object only inside the spawn-ahead window. A note moves from `pending` to `hit` or `missed`, then its visual is destroyed and removed from the active collection.

## Scene cleanup

On shutdown RhythmScene stops and disconnects all scheduled Web Audio sources, removes timers and keyboard listeners, and lets Phaser destroy scene-owned visuals.

## Judgement flow

Keyboard or one touch lane calls `pressLane`. The input timestamp receives `GLOBAL_INPUT_OFFSET_MS`, the nearest pending note in that lane is selected, and `JudgementSystem` returns PERFECT, GOOD, MISS, or no judgement. Overdue notes are marked MISS by `NoteManager`.

## Scoring flow

`ScoreSystem` is pure TypeScript. A judgement updates score, combo, maximum combo, counts, multiplier, and crowd energy. RhythmScene passes the completed state and Berlin score to ResultScene, where they are displayed separately and combined for the total.
