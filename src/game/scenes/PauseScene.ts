import Phaser from 'phaser';
import { Depth } from '../constants';
import { SoundManager } from '../audio/SoundManager';
import { PAUSE_SCENE_KEY, resumeFromPause, restartFromPause, type PauseSceneData } from '../systems/pause/PauseCoordinator';

const PANEL_WIDTH = 360;
const BUTTON_GAP = 64;

/**
 * The one pause overlay every pausable scene shares. Launched additively on
 * top of the frozen scene (`scene.scene.launch`), so this scene's own input
 * stays live while the one underneath is fully paused. Never itself
 * pausable (`static pausable = false`, checked by `isPausable`) — opting out
 * is what stops it recursing into itself.
 */
export class PauseScene extends Phaser.Scene {
  static readonly pausable = false;

  private soundLabel!: Phaser.GameObjects.Text;
  private unsubscribeSound?: () => void;

  constructor() {
    super(PAUSE_SCENE_KEY);
  }

  create(): void {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    this.add
      .rectangle(0, 0, width, height, 0x000000, 0.72)
      .setOrigin(0, 0)
      .setDepth(Depth.UI + 90)
      .setInteractive(); // Swallows clicks so they can't reach the frozen scene underneath.

    this.add
      .rectangle(centerX, centerY, PANEL_WIDTH, 320, 0x1a0f26, 0.96)
      .setStrokeStyle(2, 0xffdf57, 0.8)
      .setDepth(Depth.UI + 91);

    this.add
      .text(centerX, centerY - 120, 'PAUSED', {
        fontFamily: 'Archivo Black',
        fontSize: '32px',
        color: '#ffdf57',
      })
      .setOrigin(0.5)
      .setDepth(Depth.UI + 92);

    this.createButton(centerX, centerY - 120 + BUTTON_GAP, 'RESUME', () => resumeFromPause(this));
    this.createButton(centerX, centerY - 120 + BUTTON_GAP * 2, 'RESTART', () => restartFromPause(this));
    this.soundLabel = this.createButton(centerX, centerY - 120 + BUTTON_GAP * 3, '', () =>
      SoundManager.toggle(),
    );
    this.unsubscribeSound = SoundManager.onChange((muted) => {
      this.soundLabel.setText(`SOUND: ${muted ? 'OFF' : 'ON'}`);
    });

    const onKey = (): void => resumeFromPause(this);
    this.input.keyboard?.on('keydown-ESC', onKey);
    this.input.keyboard?.on('keydown-P', onKey);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', onKey);
      this.input.keyboard?.off('keydown-P', onKey);
      this.unsubscribeSound?.();
      this.unsubscribeSound = undefined;
    });
  }

  private createButton(x: number, y: number, label: string, onActivate: () => void): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'Archivo Black',
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#3a2650',
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(Depth.UI + 92)
      .setInteractive({ useHandCursor: true });
    text.on('pointerup', onActivate);
    text.on('pointerover', () => text.setColor('#ffdf57'));
    text.on('pointerout', () => text.setColor('#ffffff'));
    return text;
  }
}

export type { PauseSceneData };
