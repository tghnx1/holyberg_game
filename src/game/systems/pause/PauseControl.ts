import Phaser from 'phaser';
import { Depth } from '../../constants';
import { getViewportInfo } from '../../responsive/ResponsiveLayout';
import type { ViewportInfo } from '../../responsive/ViewportInfo';
import { SoundManager } from '../../audio/SoundManager';
import { isPaused, requestPause } from './PauseCoordinator';
import { isPausable } from './PausableScene';
import { PauseHudReservedWidth } from './PauseHudReservedWidth';

/** Compact: desktop has a mouse, so the touch-target floor doesn't apply. */
const DESKTOP_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Space Mono',
  fontSize: '20px',
  color: '#ffdd57',
  backgroundColor: '#23132fdd',
  padding: { x: 12, y: 8 },
};

/**
 * Noticeably larger on touch — comparable in visual weight to the SCORE
 * label rather than a small icon — and padded well past the ~44px minimum
 * comfortable tap target.
 */
const TOUCH_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Space Mono',
  fontSize: '30px',
  color: '#ffdd57',
  backgroundColor: '#23132fdd',
  padding: { x: 22, y: 20 },
};

function buttonStyle(viewport: ViewportInfo): Phaser.Types.GameObjects.Text.TextStyle {
  return viewport.touchOriented ? TOUCH_STYLE : DESKTOP_STYLE;
}

/** Gap between the pause and sound buttons; a bit wider on touch so two adjacent targets aren't easy to fat-finger together. */
function buttonGap(viewport: ViewportInfo): number {
  return viewport.touchOriented ? 14 : 10;
}

function makeHudButton(scene: Phaser.Scene, label: string): Phaser.GameObjects.Text {
  return scene.add
    .text(0, 0, label, buttonStyle(getViewportInfo(scene.scale)))
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(Depth.UI + 50)
    // useHandCursor is desktop-only chrome; the object still fully responds
    // to touch — Phaser resolves both mouse and touch through the same
    // pointer events, so this was never touch-only.
    .setInteractive({ useHandCursor: true });
}

/**
 * Scenes with controls attached for their current run. `installPauseLifecycle`
 * can reach a scene by two paths (its CREATE event, or the immediate attach
 * for a scene already running when the installer boots), and this keeps the
 * second one from stacking a duplicate set of buttons on top of the first.
 * Cleared on SHUTDOWN, so the next run of the same scene attaches again.
 */
const attached = new WeakSet<Phaser.Scene>();

/**
 * Attaches an always-visible pause button and sound toggle to `scene`, plus
 * ESC/P as keyboard shortcuts for pause. Called once per scene create by
 * `installPauseLifecycle`, so every current and future playable scene gets
 * this automatically — nothing here names a scene, it only checks
 * `isPausable(scene)`, the opt-out a non-game screen sets.
 *
 * Both buttons right-anchor to the safe-margin line, sound outermost and
 * pause just to its left, so they read as one top-right HUD row. Their
 * combined width — measured from the actual rendered buttons, not
 * estimated, since "SND ON"/"SND OFF" aren't the same width — is published
 * through `PauseHudReservedWidth` so anything else anchored to that corner
 * (currently `HudSystem`'s SCORE label) can offset itself and never overlap,
 * without this module knowing that label exists.
 */
export function attachPauseControl(scene: Phaser.Scene): void {
  if (!isPausable(scene)) return;
  if (attached.has(scene)) return;
  attached.add(scene);

  const triggerPause = (): void => {
    if (isPaused()) return;
    requestPause(scene);
  };

  const onKey = (): void => triggerPause();
  scene.input.keyboard?.on('keydown-ESC', onKey);
  scene.input.keyboard?.on('keydown-P', onKey);

  // Plain ASCII/basic-Latin glyphs, not the pause/emoji symbol blocks: those
  // aren't guaranteed to be in every desktop font's fallback chain, which is
  // why the earlier "⏸" button could render as nothing at all on desktop.
  const pauseButton = makeHudButton(scene, 'II');
  const soundButton = makeHudButton(scene, SoundManager.isMuted ? 'SND OFF' : 'SND ON');

  const place = (): void => {
    const viewport = getViewportInfo(scene.scale);
    const margin = viewport.safeMargin;
    const gap = buttonGap(viewport);
    const style = buttonStyle(viewport);
    pauseButton.setStyle(style);
    soundButton.setStyle(style);

    const width = scene.cameras.main.width;
    soundButton.setPosition(width - margin, margin);
    pauseButton.setPosition(soundButton.x - soundButton.displayWidth - gap, margin);

    // Distance from the margin line to the left edge of the row: what a
    // right-anchored neighbour (SCORE) needs to stay clear of both buttons.
    const leftEdge = pauseButton.x - pauseButton.displayWidth;
    PauseHudReservedWidth.set(width - margin - leftEdge);
  };

  const onPauseDown = (
    _pointer: Phaser.Input.Pointer,
    _x: number,
    _y: number,
    event: Phaser.Types.Input.EventData,
  ): void => {
    // Stop the press reaching a jump zone or rhythm lane underneath.
    event.stopPropagation();
    triggerPause();
  };
  const onSoundDown = (
    _pointer: Phaser.Input.Pointer,
    _x: number,
    _y: number,
    event: Phaser.Types.Input.EventData,
  ): void => {
    event.stopPropagation();
    SoundManager.toggle();
  };
  const applyMuteState = (muted: boolean): void => {
    soundButton.setText(muted ? 'SND OFF' : 'SND ON');
    soundButton.setColor(muted ? '#8f8f9c' : '#ffdd57');
    place();
  };
  const onResize = (): void => place();

  pauseButton.on('pointerdown', onPauseDown);
  soundButton.on('pointerdown', onSoundDown);
  scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
  const unsubscribeSound = SoundManager.onChange(applyMuteState);
  place();

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    attached.delete(scene);
    scene.input.keyboard?.off('keydown-ESC', onKey);
    scene.input.keyboard?.off('keydown-P', onKey);
    pauseButton.off('pointerdown', onPauseDown);
    soundButton.off('pointerdown', onSoundDown);
    scene.scale.off(Phaser.Scale.Events.RESIZE, onResize);
    unsubscribeSound();
    pauseButton.destroy();
    soundButton.destroy();
    // So the next scene's HUD doesn't briefly reserve space for a button row
    // that hasn't attached yet (or, for a non-pausable scene, never will).
    PauseHudReservedWidth.set(0);
  });
}
