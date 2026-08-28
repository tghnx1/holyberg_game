import Phaser from 'phaser';
import { Depth } from '../../constants';
import { getViewportInfo } from '../../responsive/ResponsiveLayout';
import { SoundManager } from '../../audio/SoundManager';
import { isPaused, requestPause } from './PauseCoordinator';
import { isPausable } from './PausableScene';

const BUTTON_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Space Mono',
  fontSize: '20px',
  color: '#ffdd57',
  backgroundColor: '#23132fdd',
  // Padding is the touch target: small mark, finger-sized hit area.
  padding: { x: 12, y: 8 },
};

function makeHudButton(scene: Phaser.Scene, label: string): Phaser.GameObjects.Text {
  return scene.add
    .text(0, 0, label, BUTTON_STYLE)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(Depth.UI + 50)
    // useHandCursor is desktop-only chrome; the object still fully responds
    // to touch — Phaser resolves both mouse and touch through the same
    // pointer events, so this was never touch-only.
    .setInteractive({ useHandCursor: true });
}

/**
 * Attaches an always-visible pause button and sound toggle to `scene`, plus
 * ESC/P as keyboard shortcuts for pause. Called once per scene create by
 * `installPauseLifecycle`, so every current and future playable scene gets
 * this automatically — nothing here names a scene, it only checks
 * `isPausable(scene)`, the opt-out a non-game screen sets.
 */
/**
 * Scenes with controls attached for their current run. `installPauseLifecycle`
 * can reach a scene by two paths (its CREATE event, or the immediate attach
 * for a scene already running when the installer boots), and this keeps the
 * second one from stacking a duplicate set of buttons on top of the first.
 * Cleared on SHUTDOWN, so the next run of the same scene attaches again.
 */
const attached = new WeakSet<Phaser.Scene>();

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
    const margin = getViewportInfo(scene.scale).safeMargin;
    pauseButton.setPosition(margin, margin);
    soundButton.setPosition(margin + pauseButton.width + 10, margin);
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
  });
}
