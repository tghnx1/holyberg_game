import Phaser from 'phaser';
import { RhythmDepth } from './constants';
import {
  getRhythmAssetLayout,
  RHYTHM_MIXER_HEIGHT,
  RHYTHM_MIXER_WIDTH,
} from './RhythmAssetLayout';

const CYAN = 0x21d4ff;
const ORANGE = 0xff6a1a;

/** Decorative only: gameplay objects and input remain in their existing layers. */
export class RhythmMixer {
  readonly root: Phaser.GameObjects.Container;
  private readonly leds: Phaser.GameObjects.Rectangle[] = [];
  private readonly perfectGlow: Phaser.GameObjects.Rectangle;

  constructor(private readonly scene: Phaser.Scene, centerX: number) {
    const layout = getRhythmAssetLayout(centerX);
    this.root = scene.add.container(layout.mixerX, layout.mixerY).setDepth(RhythmDepth.HIGHWAY + 26);

    this.perfectGlow = scene.add.rectangle(0, 48, RHYTHM_MIXER_WIDTH + 16, 112, CYAN, 0)
      .setStrokeStyle(5, CYAN, 0.75);
    this.root.add(this.perfectGlow);

    const body = scene.add.graphics();
    body.fillStyle(0x07111b, 0.98).fillPoints([
      new Phaser.Geom.Point(-RHYTHM_MIXER_WIDTH / 2, 0),
      new Phaser.Geom.Point(RHYTHM_MIXER_WIDTH / 2, 0),
      new Phaser.Geom.Point(RHYTHM_MIXER_WIDTH / 2 - 7, RHYTHM_MIXER_HEIGHT),
      new Phaser.Geom.Point(-RHYTHM_MIXER_WIDTH / 2 + 7, RHYTHM_MIXER_HEIGHT),
    ], true);
    body.lineStyle(3, CYAN, 0.72).lineBetween(-88, 0, 88, 0);
    body.lineStyle(2, ORANGE, 0.65).lineBetween(-82, 5, 82, 5);
    body.lineStyle(2, 0x172c3d, 1).strokeRoundedRect(-79, 9, 158, 82, 8);
    this.root.add(body);

    const channelXs = [-58, -20, 20, 58];
    channelXs.forEach((x, channel) => this.createChannel(x, channel));

    const crossfader = scene.add.graphics();
    crossfader.fillStyle(0x03080d, 1).fillRoundedRect(-64, 91, 128, 8, 4);
    crossfader.lineStyle(2, CYAN, 0.55).strokeRoundedRect(-64, 91, 128, 8, 4);
    crossfader.fillStyle(ORANGE, 1).fillRoundedRect(-8, 88, 16, 14, 4);
    this.root.add(crossfader);
  }

  setCenterX(centerX: number): void {
    this.root.setX(centerX);
  }

  pulseBeat(strong: boolean): void {
    for (let index = 0; index < this.leds.length; index += 1) {
      const led = this.leds[index];
      this.scene.tweens.killTweensOf(led);
      led.setAlpha(strong || index % 2 === 0 ? 0.95 : 0.68);
      this.scene.tweens.add({ targets: led, alpha: 0.28, duration: strong ? 220 : 150 });
    }
  }

  flashPerfect(): void {
    this.scene.tweens.killTweensOf(this.perfectGlow);
    this.perfectGlow.setAlpha(0.38);
    this.scene.tweens.add({ targets: this.perfectGlow, alpha: 0, duration: 260 });
  }

  private createChannel(x: number, channel: number): void {
    const accent = channel % 2 === 0 ? CYAN : ORANGE;
    const strip = this.scene.add.rectangle(x, 48, 28, 72, 0x0c1a26, 0.96)
      .setStrokeStyle(1, accent, 0.58);
    const eqHigh = this.scene.add.circle(x, 25, 6, 0x050a10).setStrokeStyle(2, accent, 0.9);
    const eqLow = this.scene.add.circle(x, 43, 6, 0x050a10).setStrokeStyle(2, accent, 0.7);
    const faderTrack = this.scene.add.rectangle(x, 68, 3, 25, 0x284054);
    const faderCap = this.scene.add.rectangle(x, 62 + (channel % 3) * 6, 13, 5, accent);
    const led = this.scene.add.rectangle(x, 13, 14, 4, accent, 0.28);
    this.leds.push(led);
    this.root.add([strip, eqHigh, eqLow, faderTrack, faderCap, led]);
  }
}
