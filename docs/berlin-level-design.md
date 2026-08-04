# Berlin level design

The Berlin run uses a 7000-unit logical world and Phaser's existing 1280×720 FIT canvas. Its five sections are Apartment (0–800), Berlin Street (800–2200), Bridge (2200–3800), Night Berlin (3800–5200), and Club Exterior (5200–7000). All gameplay entities live in `berlinLevelConfig.ts`; `LevelBuilder` creates both placeholder artwork and an independent Arcade Physics hitbox from each entry.

The player auto-runs. Space/Up or JUMP requests a buffered jump; S/Down or DUCK applies a reduced crouch body. Jumping has 100 ms coyote time and a 120 ms input buffer, with no double jump or crouch jump. Obstacles remove three seconds and up to 100 points, flash/shake the camera, and grant one second of invulnerability. A clean section awards 250 points. Remaining time at backstage is worth `ceil(seconds) × 20`.

The USB at x=650 is mandatory and worth 500. Optional pickups and the energy bonus are declared beside obstacles in the same config. The initial timer is 40 seconds.

Authored jump obstacles are at x=1050, 1450, 2050, 3500, 5050, 5750, and 6450. Duck obstacles are at x=2500, 4700, and 6100; moving NPC hazards are at x=2850 and 4000. Optional pickups are headphones x=1750 (+200), poster x=3150 (+100), vinyl x=4350 (+150), and club pass x=5450 (+200). Energy at x=3700 adds three seconds. Backstage finish is x=6800.

The run fails when the timer reaches zero. Reaching backstage without the USB displays a warning and leaves the run active; reaching it with the USB applies the time bonus and transitions to RhythmScene.

In development, G toggles hitboxes, section boundaries, and live run state. Shift+1 through Shift+5 warp to section starts. Placeholder labels show JUMP, DUCK, MOVING, USB, bonus item names, and FINISH.
