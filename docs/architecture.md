# Architecture

## Audio-clock synchronization

Each MIDI chart note has an absolute `time` in seconds. After a user gesture unlocks Web Audio, the countdown schedules the decoded track and starts `RhythmClock` from the same audio-context origin. Rendering computes note progress from audio time, preventing frame-rate drift.

## 2.5D perspective

The highway is a Phaser-drawn trapezoid. Pure `getPerspectivePosition` converts time progress into an eased Y coordinate, interpolates the highway half-width between horizon and judgement line, applies a normalized lane offset, and scales each note from 0.2 to 1.2. No 3D renderer is involved.

## Note lifecycle

`RhythmEngine` owns lightweight note state and enforces one-time transitions from `pending` to `hit` or `missed`. `NoteManager` spawns Phaser objects only inside the look-ahead window and removes visuals when the engine resolves them.

## Scene cleanup

On shutdown RhythmScene stops the source, closes its audio context, removes timers and keyboard listeners, and destroys active note visuals.

## Judgement flow

Keyboard or one touch lane calls `pressLane`. The audio timestamp receives the local-storage input offset, `RhythmEngine` selects the nearest pending note in that lane, and `JudgementSystem` returns PERFECT, GOOD, OK, or no judgement. The engine marks overdue notes MISS.

## Scoring flow

`ScoreSystem` is pure TypeScript. A judgement updates score, combo, maximum combo, counts, and multiplier. RhythmScene passes the completed state and Berlin score to ResultScene, where they are displayed separately and combined for the total.
