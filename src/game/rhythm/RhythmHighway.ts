import Phaser from 'phaser';
import { HIT_LINE_Y, HORIZON_Y, LANE_COLORS, PAD_BOTTOM_Y, RhythmDepth } from './constants';
import { getJudgementPadGeometry, getLaneBoundariesAtY } from './PerspectiveMath';

interface PadVisual { container: Phaser.GameObjects.Container; graphics: Phaser.GameObjects.Graphics; lane: number; }

export class RhythmHighway {
  readonly lanePads: PadVisual[] = [];
  readonly root: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  private screenCenterX = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setScale(1, 1).setDepth(RhythmDepth.HIGHWAY);
    this.graphics = scene.add.graphics();
    this.root.add(this.graphics);
    this.glow = scene.add.graphics();
    this.root.add(this.glow);
    this.createPads();
  }

  flashLane(lane: number, color: number, strong: boolean): void {
    const pad = this.lanePads[lane];
    this.drawPad(pad, color, 1);
    pad.container.setScale(0.94);
    this.scene.tweens.add({ targets: pad.container, alpha: 0.65, scale: 1, duration: strong ? 190 : 130, onComplete: () => this.drawPad(pad, LANE_COLORS[lane], 0.65) });
  }

  pulse(): void {
    this.drawHitLine(1);
    this.scene.tweens.addCounter({ from: 1, to: 0.8, duration: 130, onUpdate: (tween) => this.drawHitLine(tween.getValue() ?? 0.8) });
  }

  refreshGeometry(screenCenterX: number): void {
    this.screenCenterX = screenCenterX;
    this.drawHighway();
    for (const pad of this.lanePads) {
      const geometry = getJudgementPadGeometry(pad.lane as 0 | 1 | 2 | 3, this.screenCenterX);
      pad.container.setPosition(geometry.centerX, geometry.centerY).setScale(1, 1);
      this.drawPad(pad, LANE_COLORS[pad.lane], 0.65);
    }
    this.drawHitLine(0.8);
  }

  private drawHighway(): void {
    const horizon = getLaneBoundariesAtY(HORIZON_Y, this.screenCenterX);
    const bottom = getLaneBoundariesAtY(PAD_BOTTOM_Y, this.screenCenterX);
    this.graphics.clear();
    this.graphics.fillStyle(0x120a20, 0.94).fillPoints([
      new Phaser.Geom.Point(horizon[0], HORIZON_Y), new Phaser.Geom.Point(horizon[4], HORIZON_Y),
      new Phaser.Geom.Point(bottom[4], PAD_BOTTOM_Y), new Phaser.Geom.Point(bottom[0], PAD_BOTTOM_Y),
    ], true);
    this.graphics.lineStyle(5, 0xff477e, 0.75);
    this.graphics.strokePoints([
      new Phaser.Geom.Point(horizon[0], HORIZON_Y), new Phaser.Geom.Point(bottom[0], PAD_BOTTOM_Y),
      new Phaser.Geom.Point(bottom[4], PAD_BOTTOM_Y), new Phaser.Geom.Point(horizon[4], HORIZON_Y),
    ]);
    for (let boundary = 1; boundary < 4; boundary += 1) {
      this.graphics.lineStyle(2, 0xffffff, 0.28).lineBetween(horizon[boundary], HORIZON_Y, bottom[boundary], PAD_BOTTOM_Y);
    }
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
      this.drawPad(pad, LANE_COLORS[lane], 0.65);
      this.lanePads.push(pad);
    }
  }

  private drawPad(pad: PadVisual, color: number, alpha: number): void {
    const geometry = getJudgementPadGeometry(pad.lane as 0 | 1 | 2 | 3, this.screenCenterX);
    const points: Phaser.Geom.Point[] = [];
    for (let index = 0; index < geometry.points.length; index += 2) points.push(new Phaser.Geom.Point(geometry.points[index], geometry.points[index + 1]));
    pad.graphics.clear().fillStyle(color, alpha).fillPoints(points, true).lineStyle(3, 0xffffff, 0.55).strokePoints(points, true);
  }
}
