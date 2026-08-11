import Phaser from 'phaser';
import { HIT_LINE_Y, RhythmDepth } from './constants';
import { getJudgementPadGeometry, getLaneBoundariesAtY } from './PerspectiveMath';
import {
  RHYTHM_HIGHWAY_HEIGHT,
  RHYTHM_HIGHWAY_TEXTURE_KEY,
  RHYTHM_HIGHWAY_WIDTH,
} from './RhythmAssetLayout';

interface PadVisual { container: Phaser.GameObjects.Container; graphics: Phaser.GameObjects.Graphics; lane: number; }

export class RhythmHighway {
  readonly lanePads: PadVisual[] = [];
  readonly root: Phaser.GameObjects.Container;
  private readonly visual: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Graphics;
  private screenCenterX = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setScale(1, 1).setDepth(RhythmDepth.HIGHWAY);
    this.visual = scene.add.image(0, 0, RHYTHM_HIGHWAY_TEXTURE_KEY)
      .setOrigin(0.5, 0)
      .setDisplaySize(RHYTHM_HIGHWAY_WIDTH, RHYTHM_HIGHWAY_HEIGHT);
    this.root.add(this.visual);
    this.glow = scene.add.graphics();
    this.root.add(this.glow);
    this.createPads();
  }

  flashLane(lane: number, color: number, strong: boolean): void {
    const pad = this.lanePads[lane];
    this.drawPad(pad, color, 1);
    pad.container.setScale(0.94);
    this.scene.tweens.add({ targets: pad.container, alpha: 0, scale: 1, duration: strong ? 190 : 130, onComplete: () => this.clearPad(pad) });
  }

  pulse(): void {
    this.drawHitLine(1);
    this.scene.tweens.addCounter({ from: 1, to: 0, duration: 130, onUpdate: (tween) => this.drawHitLine(tween.getValue() ?? 0), onComplete: () => this.glow.clear() });
  }

  refreshGeometry(screenCenterX: number): void {
    this.screenCenterX = screenCenterX;
    this.visual.setX(screenCenterX);
    for (const pad of this.lanePads) {
      const geometry = getJudgementPadGeometry(pad.lane as 0 | 1 | 2 | 3, this.screenCenterX);
      pad.container.setPosition(geometry.centerX, geometry.centerY).setScale(1, 1).setAlpha(0);
      this.clearPad(pad);
    }
    this.glow.clear();
  }

  private drawHitLine(alpha: number): void {
    const hit = getLaneBoundariesAtY(HIT_LINE_Y, this.screenCenterX);
    this.glow.clear();
    this.glow.lineStyle(18, 0xffdf57, alpha * 0.22).lineBetween(hit[0], HIT_LINE_Y, hit[4], HIT_LINE_Y);
    this.glow.lineStyle(7, 0xffffff, alpha).lineBetween(hit[0], HIT_LINE_Y, hit[4], HIT_LINE_Y);
  }

  private createPads(): void {
    for (let lane = 0; lane < 4; lane += 1) {
      const geometry = getJudgementPadGeometry(lane as 0 | 1 | 2 | 3, this.screenCenterX);
      const graphics = this.scene.add.graphics();
      const container = this.scene.add.container(geometry.centerX, geometry.centerY, [graphics]);
      this.root.add(container);
      const pad = { container, graphics, lane };
      this.clearPad(pad);
      this.lanePads.push(pad);
    }
  }

  private drawPad(pad: PadVisual, color: number, alpha: number): void {
    const geometry = getJudgementPadGeometry(pad.lane as 0 | 1 | 2 | 3, this.screenCenterX);
    const points: Phaser.Geom.Point[] = [];
    for (let index = 0; index < geometry.points.length; index += 2) points.push(new Phaser.Geom.Point(geometry.points[index], geometry.points[index + 1]));
    pad.graphics.clear().fillStyle(color, alpha).fillPoints(points, true).lineStyle(3, 0xffffff, 0.55).strokePoints(points, true);
    pad.container.setAlpha(1);
  }

  private clearPad(pad: PadVisual): void {
    pad.graphics.clear();
    pad.container.setAlpha(0);
  }
}
