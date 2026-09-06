import Phaser from 'phaser';
import { Depth } from '../constants';
import { SoundManager } from '../audio/SoundManager';
import { SfxManager } from '../audio/SfxManager';
import { PAUSE_SCENE_KEY, resumeFromPause, restartFromPause, type PauseSceneData } from '../systems/pause/PauseCoordinator';
import { UI_COLORS, UI_FONTS, uiButtonStyle, uiHeadingStyle } from '../ui/theme';
import { getViewportInfo } from '../responsive/ResponsiveLayout';
import type { ViewportInfo } from '../responsive/ViewportInfo';
import { responsiveFontSize } from '../ui/mobileTypography';

const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 520;
const VOLUME_STEP = 0.1;

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
  private sfxLabel!: Phaser.GameObjects.Text;
  private musicVolumeLabel!: Phaser.GameObjects.Text;
  private sfxVolumeLabel!: Phaser.GameObjects.Text;
  private unsubscribeSound?: () => void;
  private unsubscribeSfx?: () => void;
  private unsubscribeMusicVolume?: () => void;
  private unsubscribeSfxVolume?: () => void;
  private heading!: Phaser.GameObjects.Text;
  private buttonTexts: Phaser.GameObjects.Text[] = [];
  private volumeTexts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super(PAUSE_SCENE_KEY);
  }

  create(): void {
    this.buttonTexts = [];
    this.volumeTexts = [];
    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    this.add
      .rectangle(0, 0, width, height, 0x000000, 0.72)
      .setOrigin(0, 0)
      .setDepth(Depth.UI + 90)
      .setInteractive(); // Swallows clicks so they can't reach the frozen scene underneath.

    this.add
      .rectangle(centerX, centerY, PANEL_WIDTH, PANEL_HEIGHT, UI_COLORS.panelNumber, 0.96)
      .setStrokeStyle(2, UI_COLORS.accentNumber, 0.9)
      .setDepth(Depth.UI + 91);

    this.heading = this.add
      .text(centerX, centerY - 220, 'PAUSED', uiHeadingStyle('32px'))
      .setOrigin(0.5)
      .setDepth(Depth.UI + 92);

    this.createButton(centerX, centerY - 160, 'RESUME', () => resumeFromPause(this));
    this.createButton(centerX, centerY - 104, 'RESTART', () => restartFromPause(this));
    this.soundLabel = this.createButton(centerX, centerY - 40, '', () =>
      SoundManager.toggle(),
    );
    this.unsubscribeSound = SoundManager.onChange((muted) => {
      this.soundLabel.setText(`MUSIC: ${muted ? 'OFF' : 'ON'}`);
    });
    this.musicVolumeLabel = this.createVolumeControls(centerX, centerY + 12, 'MUSIC VOLUME', () =>
      SoundManager.adjustVolume(-VOLUME_STEP),
      () => SoundManager.adjustVolume(VOLUME_STEP),
    );
    this.unsubscribeMusicVolume = SoundManager.onVolumeChange((volume) => {
      this.musicVolumeLabel.setText(`MUSIC VOLUME: ${Math.round(volume * 100)}%`);
    });

    // Independent from music: system sounds are one-shot gameplay/UI SFX.
    this.sfxLabel = this.createButton(centerX, centerY + 80, '', () =>
      SfxManager.toggle(),
    );
    this.unsubscribeSfx = SfxManager.onChange((muted) => {
      this.sfxLabel.setText(`SYSTEM SOUNDS: ${muted ? 'OFF' : 'ON'}`);
    });
    this.sfxVolumeLabel = this.createVolumeControls(centerX, centerY + 132, 'SFX VOLUME', () =>
      SfxManager.adjustVolume(-VOLUME_STEP),
      () => SfxManager.adjustVolume(VOLUME_STEP),
    );
    this.unsubscribeSfxVolume = SfxManager.onVolumeChange((volume) => {
      this.sfxVolumeLabel.setText(`SFX VOLUME: ${Math.round(volume * 100)}%`);
    });

    const applyTypography = (): void => this.applyTypography(getViewportInfo(this.scale));
    this.scale.on(Phaser.Scale.Events.RESIZE, applyTypography);
    applyTypography();

    const onKey = (): void => resumeFromPause(this);
    this.input.keyboard?.on('keydown-ESC', onKey);
    this.input.keyboard?.on('keydown-P', onKey);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', onKey);
      this.input.keyboard?.off('keydown-P', onKey);
      this.unsubscribeSound?.();
      this.unsubscribeSound = undefined;
      this.unsubscribeSfx?.();
      this.unsubscribeSfx = undefined;
      this.unsubscribeMusicVolume?.();
      this.unsubscribeMusicVolume = undefined;
      this.unsubscribeSfxVolume?.();
      this.unsubscribeSfxVolume = undefined;
      this.scale.off(Phaser.Scale.Events.RESIZE, applyTypography);
    });
  }

  private createButton(x: number, y: number, label: string, onActivate: () => void): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, y, label, {
        fontFamily: UI_FONTS.body,
        fontSize: '22px',
        fontStyle: 'bold',
        color: UI_COLORS.textPrimary,
        backgroundColor: UI_COLORS.panelRaised,
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(Depth.UI + 92)
      .setInteractive({ useHandCursor: true });
    text.on('pointerup', onActivate);
    text.on('pointerover', () => text.setColor(UI_COLORS.accentBright));
    text.on('pointerout', () => text.setColor(UI_COLORS.textPrimary));
    this.buttonTexts.push(text);
    return text;
  }

  private createVolumeControls(
    x: number,
    y: number,
    label: string,
    onDecrease: () => void,
    onIncrease: () => void,
  ): Phaser.GameObjects.Text {
    const value = this.add
      .text(x, y, label, {
        fontFamily: UI_FONTS.body,
        fontSize: '16px',
        fontStyle: 'bold',
        color: UI_COLORS.textPrimary,
      })
      .setOrigin(0.5)
      .setDepth(Depth.UI + 92);
    this.volumeTexts.push(value);
    this.createSmallButton(x - 145, y, '-', onDecrease);
    this.createSmallButton(x + 145, y, '+', onIncrease);
    return value;
  }

  private createSmallButton(x: number, y: number, label: '-' | '+', onActivate: () => void): Phaser.GameObjects.Text {
    const button = this.add
      .text(x, y, label, uiButtonStyle('22px', { padding: { x: 12, y: 4 } }))
      .setOrigin(0.5)
      .setDepth(Depth.UI + 92)
      .setInteractive({ useHandCursor: true });
    button.on('pointerup', onActivate);
    this.buttonTexts.push(button);
    return button;
  }

  private applyTypography(viewport: ViewportInfo): void {
    this.heading.setFontSize(responsiveFontSize(32, viewport, 'heading'));
    for (const text of this.buttonTexts) {
      text.setFontSize(responsiveFontSize(22, viewport, 'button'));
    }
    for (const text of this.volumeTexts) {
      text.setFontSize(responsiveFontSize(16, viewport, 'body'));
    }
  }
}

export type { PauseSceneData };
