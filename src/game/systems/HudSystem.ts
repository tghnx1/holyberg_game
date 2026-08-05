import Phaser from 'phaser';
import { Depth } from '../constants';
import { getViewportInfo } from '../responsive/ResponsiveLayout';
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
  private readonly scene: Phaser.Scene;

  constructor(
    scene: Phaser.Scene,
    onJump: () => void,
    onDuck: (pressed: boolean) => void,
    uiLayer?: Phaser.GameObjects.Layer,
  ) {
    this.scene = scene;
    this.time = scene.add.text(0, 0, '', style);
    this.score = scene.add.text(0, 0, '', style).setOrigin(1, 0);
    this.message = scene.add
      .text(0, 0, '', { ...style, fontSize: '26px', align: 'center' })
      .setOrigin(0.5)
      .setAlpha(0);
    this.jump = this.button(scene, 'JUMP', 0xff4f23).on('pointerdown', onJump);
    this.duck = this.button(scene, 'DUCK', 0x925bd1)
      .on(
        'pointerdown',
        (pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          pointer.event?.preventDefault();
          onDuck(true);
        },
      )
      .on(
        'pointerup',
        (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          onDuck(false);
        },
      )
      .on(
        'pointerupoutside',
        (_pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          onDuck(false);
        },
      )
      .on('pointerout', () => onDuck(false));
    // Safety net: if the pointer leaves the game canvas entirely mid-drag
    // (common on touch devices), the button never sees pointerup/pointerout.
    scene.input.on('gameout', () => onDuck(false));
    const objects = [this.time, this.score, this.message, this.jump, this.duck];
    objects.forEach((object) => object.setScrollFactor(0).setDepth(Depth.UI));
    uiLayer?.add(objects);
    this.applyLayout(getViewportInfo(scene.scale));
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
    // Camera width follows the viewport aspect ratio under Scale.EXPAND (see
    // ExpandScale.ts), so HUD elements anchor to the camera's own visible
    // bounds instead of the old fixed DESIGN_WIDTH/DESIGN_HEIGHT constants.
    const camera = this.scene.cameras.main;
    const left = camera.scrollX;
    const top = camera.scrollY;
    const right = left + camera.width;
    const bottom = top + camera.height;
    const width = right - left;
    const height = bottom - top;
    const margin = viewport.safeMargin;
    const scale = viewport.compactLandscape ? 0.82 : 1;
    this.time.setPosition(margin, margin).setScale(viewport.hudScale);
    this.score.setPosition(width - margin, margin).setScale(viewport.hudScale);
    this.message.setPosition(width / 2, margin + 66).setScale(viewport.hudScale);
    this.jump.setPosition(width - margin - 66, height - margin - 66).setScale(scale);
    this.duck.setPosition(width - margin - 210, height - margin - 66).setScale(scale);
  }

  private button(scene: Phaser.Scene, label: string, color: number): Phaser.GameObjects.Container {
    const circle = scene.add.circle(0, 0, 58, color, 0.86).setStrokeStyle(4, 0xffce69);
    const text = scene.add.text(0, 0, label, { ...style, fontSize: '16px' }).setOrigin(0.5);
    const container = scene.add.container(0, 0, [circle, text]).setSize(120, 120);
    // Hit area (156x156) is intentionally larger than the visible circle
    // (116 diameter) so touch input is forgiving on small screens. A Geom.Circle
    // hitArea does not hit-test correctly on Container game objects in this
    // Phaser version (confirmed: pointerdown never fires), so use a Rectangle.
    container.setInteractive(new Phaser.Geom.Rectangle(-78, -78, 156, 156), Phaser.Geom.Rectangle.Contains);
    return container;
  }
}
