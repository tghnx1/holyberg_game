import Phaser from 'phaser';
import { DJ_GAMEPLAY_TOP_Y, DJ_STRIP_HEIGHT, DJ_STRIP_WIDTH, getDjMixLayout } from './DjMixLayout';
import { RhythmDepth } from './constants';
import type { RhythmAction } from './types';

export class DjRhythmStrip {
  readonly root: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly leftFlash: Phaser.GameObjects.Rectangle;
  private readonly rightFlash: Phaser.GameObjects.Rectangle;
  private readonly actionBanner: Phaser.GameObjects.Text;
  private readonly holdTrack: Phaser.GameObjects.Rectangle;
  private readonly holdMeter: Phaser.GameObjects.Rectangle;

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(RhythmDepth.HIGHWAY);
    const layout = getDjMixLayout(0);
    this.panel = scene.add.rectangle(0, layout.stripCenterY, DJ_STRIP_WIDTH, DJ_STRIP_HEIGHT, 0x0b0712, 0.97).setStrokeStyle(3, 0x4d2856, 0.92);
    this.root.add(this.panel);
    this.root.add(scene.add.rectangle(0, DJ_GAMEPLAY_TOP_Y, DJ_STRIP_WIDTH, 4, 0xff477e, 0.85));

    this.leftFlash = scene.add.rectangle(-DJ_STRIP_WIDTH / 4, layout.stripCenterY, DJ_STRIP_WIDTH / 2, DJ_STRIP_HEIGHT - 8, 0xff8a3d, 0).setBlendMode(Phaser.BlendModes.ADD);
    this.rightFlash = scene.add.rectangle(DJ_STRIP_WIDTH / 4, layout.stripCenterY, DJ_STRIP_WIDTH / 2, DJ_STRIP_HEIGHT - 8, 0x9d6cff, 0).setBlendMode(Phaser.BlendModes.ADD);
    this.root.add([this.leftFlash, this.rightFlash]);

    this.drawWaveform(layout.stripCenterY);
    this.root.add(scene.add.rectangle(0, layout.stripCenterY, 2, DJ_STRIP_HEIGHT - 26, 0xffffff, 0.15));

    this.actionBanner = scene.add.text(0, 575, '', { fontFamily: 'Archivo Black', fontSize: '24px', color: '#ffffff', stroke: '#180b22', strokeThickness: 7 }).setOrigin(0.5).setVisible(false);
    this.root.add(this.actionBanner);
    this.holdTrack = scene.add.rectangle(0, 696, 300, 10, 0x27152f, 0.92).setVisible(false);
    this.holdMeter = scene.add.rectangle(-150, 696, 0, 10, 0xffdd57, 1).setOrigin(0, 0.5).setVisible(false);
    this.root.add([this.holdTrack, this.holdMeter]);
  }

  refreshGeometry(centerX: number): void {
    this.root.setX(centerX);
  }

  flashAction(action: RhythmAction, color = 0xffffff): void {
    if (action === 'tapLeft' || action === 'tapRight') {
      const flash = action === 'tapLeft' ? this.leftFlash : this.rightFlash;
      this.scene.tweens.killTweensOf(flash);
      flash.setFillStyle(color).setAlpha(0.34);
      this.scene.tweens.add({ targets: flash, alpha: 0, duration: 170 });
      return;
    }
    this.scene.tweens.killTweensOf(this.actionBanner);
    this.actionBanner.setText(action === 'holdFx' ? 'FX' : action === 'swipeLeft' ? '← SWIPE' : 'SWIPE →').setVisible(true).setColor(`#${color.toString(16).padStart(6, '0')}`).setAlpha(1).setScale(1.1);
    this.scene.tweens.add({ targets: this.actionBanner, alpha: 0, scale: 1, duration: 240, onComplete: () => this.actionBanner.setVisible(false).setAlpha(1) });
  }

  setHoldProgress(progress: number): void {
    const visible = progress > 0;
    this.holdTrack.setVisible(visible);
    this.holdMeter.setVisible(visible).setDisplaySize(300 * Phaser.Math.Clamp(progress, 0, 1), 10);
  }

  pulse(strong: boolean): void {
    this.panel.setStrokeStyle(strong ? 6 : 3, strong ? 0xffdd57 : 0x9d6cff, strong ? 0.95 : 0.7);
    this.scene.time.delayedCall(110, () => this.panel.setStrokeStyle(3, 0x4d2856, 0.92));
  }

  private drawWaveform(centerY: number): void {
    const waveform = this.scene.add.graphics();
    waveform.lineStyle(2, 0xb789c2, 0.42);
    const points: Phaser.Geom.Point[] = [];
    for (let index = 0; index <= 90; index += 1) {
      const x = -510 + index * (1020 / 90);
      const amplitude = 5 + (index % 6) * 1.4;
      points.push(new Phaser.Geom.Point(x, centerY + Math.sin(index * 1.55) * amplitude));
    }
    waveform.strokePoints(points);
    this.root.add(waveform);
  }
}
