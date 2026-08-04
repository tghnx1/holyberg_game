import Phaser from 'phaser';
import { Depth, DESIGN_HEIGHT, DESIGN_WIDTH } from '../constants';
import type { ViewportInfo } from '../responsive/ViewportInfo';
import type { BerlinProgress } from '../types/game';

const style: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Space Mono',
  fontSize: '22px',
  color: '#ffffff',
  stroke: '#10091d',
  strokeThickness: 6,
};

export class HudSystem {
  readonly time: Phaser.GameObjects.Text;
  readonly score: Phaser.GameObjects.Text;
  readonly message: Phaser.GameObjects.Text;
  readonly jump: Phaser.GameObjects.Container;
  readonly duck: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    onJump: () => void,
    onDuck: (pressed: boolean) => void,
    uiLayer?: Phaser.GameObjects.Layer,
  ) {
    this.time = scene.add.text(32, 24, '', style);
    this.score = scene.add.text(DESIGN_WIDTH - 32, 24, '', style).setOrigin(1, 0);
    this.message = scene.add
      .text(DESIGN_WIDTH / 2, 90, '', { ...style, fontSize: '26px', align: 'center' })
      .setOrigin(0.5)
      .setAlpha(0);
    this.jump = this.button(scene, 'JUMP', 0xff4f23).on('pointerdown', onJump);
    this.duck = this.button(scene, 'DUCK', 0x925bd1)
      .on('pointerdown', () => onDuck(true))
      .on('pointerup', () => onDuck(false))
      .on('pointerout', () => onDuck(false));
    const objects = [this.time, this.score, this.message, this.jump, this.duck];
    objects.forEach((object) => object.setScrollFactor(0).setDepth(Depth.UI));
    uiLayer?.add(objects);
    this.applyDefaultLayout();
  }

  update(progress: BerlinProgress): void {
    this.time.setText(`TIME  ${Math.ceil(progress.seconds)}`);
    this.score.setText(`SCORE  ${progress.score}\nUSB  ${progress.hasUsb ? '✓' : '—'}`);
  }

  flash(text: string, duration = 1100): void {
    this.message.setText(text).setAlpha(1);
    this.message.scene.tweens.killTweensOf(this.message);
    this.message.scene.tweens.add({
      targets: this.message,
      alpha: 0,
      delay: duration,
      duration: 250,
    });
  }

  applyLayout(viewport: ViewportInfo): void {
    const margin = viewport.safeMargin;
    const scale = viewport.compactLandscape ? 0.82 : 1;
    this.time.setPosition(margin, margin).setScale(viewport.hudScale);
    this.score.setPosition(DESIGN_WIDTH - margin, margin).setScale(viewport.hudScale);
    this.message.setPosition(DESIGN_WIDTH / 2, margin + 66).setScale(viewport.hudScale);
    this.jump.setPosition(DESIGN_WIDTH - margin - 66, DESIGN_HEIGHT - margin - 66).setScale(scale);
    this.duck.setPosition(DESIGN_WIDTH - margin - 210, DESIGN_HEIGHT - margin - 66).setScale(scale);
  }

  private button(scene: Phaser.Scene, label: string, color: number): Phaser.GameObjects.Container {
    const circle = scene.add.circle(0, 0, 58, color, 0.86).setStrokeStyle(4, 0xffce69);
    const text = scene.add.text(0, 0, label, { ...style, fontSize: '16px' }).setOrigin(0.5);
    return scene.add.container(0, 0, [circle, text]).setSize(120, 120).setInteractive();
  }

  private applyDefaultLayout(): void {
    this.jump.setPosition(1190, 630);
    this.duck.setPosition(1045, 630);
  }
}
