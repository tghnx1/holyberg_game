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

## MIDI rhythm engine

Level 2 is a reusable four-lane rhythm game driven by one externally curated Ableton MIDI chart per track. A track directory contains project-owned MP3/WAV audio, `chart.mid`, and metadata; adding music does not require embedding note data in TypeScript or generating difficulty variants.

Features include:

- tempo-map-aware MIDI parsing with explicit D/F/J/K lane-note numbers;
- Web Audio synchronized playback, judgement, and frame-independent note positioning;
- keyboard and four-zone landscape touch input;
- PERFECT/GOOD/OK/MISS scoring, combo multipliers, accuracy, grade, and crowd energy;
- look-ahead note spawning, one-time hit/miss state transitions, and audio-ended completion gating;
- local-storage-ready latency compensation and a development timing overlay.

The included `development-track` is an original generated fixture, not production music. Replace the `main` entry in the track registry when the final Ableton audio and chart arrive.

See [MIDI rhythm engine](docs/rhythm-engine.md), [rhythm chart authoring](docs/rhythm-chart-authoring.md), and [architecture](docs/architecture.md).

Berlin level content is driven by `src/game/level/berlin/berlinLevelConfig.ts`. See [Berlin level design](docs/berlin-level-design.md) and [art integration](docs/art-integration.md) for layout, scoring, debug shortcuts, and stable replacement slots.

## Current limitations

MIDI durations are retained, but held notes currently play as taps. The calibration value is supported through local storage; there is no calibration wizard or in-browser chart editor yet.
