import Phaser from 'phaser';
import { Depth } from '../../constants';
import { getViewportInfo } from '../../responsive/ResponsiveLayout';
import { isPaused, requestPause } from './PauseCoordinator';
import { isPausable } from './PausableScene';

/**
 * Attaches ESC/P and a visible mobile pause button to `scene`. Called once
 * per scene start by `installPauseLifecycle`, so every current and future
 * playable scene gets this automatically — nothing here names a scene, it
 * only checks `isPausable(scene)`, the opt-out a non-game screen sets.
 */
export function attachPauseControl(scene: Phaser.Scene): void {
  if (!isPausable(scene)) return;

  const trigger = (): void => {
    if (isPaused()) return;
    requestPause(scene);
  };

  const onKey = (): void => trigger();
  scene.input.keyboard?.on('keydown-ESC', onKey);
  scene.input.keyboard?.on('keydown-P', onKey);

  const button = scene.add
    .text(0, 0, '⏸', {
      fontFamily: 'Space Mono',
      fontSize: '20px',
      color: '#ffdd57',
      backgroundColor: '#23132fdd',
      // Padding is the touch target: small mark, finger-sized hit area.
      padding: { x: 12, y: 8 },
    })
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(Depth.UI + 50)
    .setInteractive({ useHandCursor: true });

  const place = (): void => {
    const margin = getViewportInfo(scene.scale).safeMargin;
    button.setPosition(margin, margin);
  };

  const onDown = (
    _pointer: Phaser.Input.Pointer,
    _x: number,
    _y: number,
    event: Phaser.Types.Input.EventData,
  ): void => {
    // Stop the press reaching a jump zone or rhythm lane underneath.
    event.stopPropagation();
    trigger();
  };
  const onResize = (): void => place();

  button.on('pointerdown', onDown);
  scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
  place();

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.input.keyboard?.off('keydown-ESC', onKey);
    scene.input.keyboard?.off('keydown-P', onKey);
    button.off('pointerdown', onDown);
    scene.scale.off(Phaser.Scale.Events.RESIZE, onResize);
    button.destroy();
  });
}
