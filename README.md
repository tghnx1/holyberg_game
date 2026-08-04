# HOLYBERG — The Run

A browser promotional-game vertical slice built with Phaser, TypeScript, Vite, and Arcade Physics.

The game keeps a 1280×720 logical canvas and uses Phaser FIT scaling for desktop and mobile landscape. Portrait orientation pauses the active scene and requests device rotation without resetting progress. Modern safe areas, fullscreen changes, and compact landscape HUD/touch sizing are handled by the shared responsive controller.

```bash
npm install
npm run dev
```

## Controls

Berlin: Space/Arrow Up jumps; S/Arrow Down ducks. On touch devices, use the large JUMP and DUCK buttons. The run starts with 40 seconds; bring the USB to backstage.

Rhythm set:

- lanes: D, F, J, K;
- aliases: Left, Down, Up, Right;
- touch: the four large lane buttons;
- results: Space/tap replays the set, R restarts Berlin.

## Rhythm charts and timing

The demo chart is `public/charts/demo.json`. Notes use absolute milliseconds and lanes 0–3. Replace it with an original event track by loading that audio in Phaser, assigning its cache key to `audioKey`, and keeping chart `timeMs` values aligned to the track playback position.

The current demo generates an original 124 BPM electronic kick/hat beat with Web Audio after the player presses Space or taps. `RhythmClock` reads that audio context's monotonic playback position; note position is always derived from `note.timeMs - currentAudioTimeMs`, never accumulated frame delta. `GLOBAL_INPUT_OFFSET_MS` in `src/game/rhythm/constants.ts` provides manual latency calibration and defaults to zero.

To replace the procedural beat, implement the same `currentTimeMs` clock-source interface around a Phaser-loaded MP3, OGG, or WAV and start it at the countdown's `DROP`. Gameplay and rendering do not need to change.

See [rhythm chart authoring](docs/rhythm-chart-authoring.md) and [architecture](docs/architecture.md).

Berlin level content is driven by `src/game/level/berlin/berlinLevelConfig.ts`. See [Berlin level design](docs/berlin-level-design.md) and [art integration](docs/art-integration.md) for layout, scoring, debug shortcuts, and stable replacement slots.

## Current limitations

All art is procedural placeholder art. The demo has no copyrighted music, calibration UI, chart editor, leaderboard, or online submission.
