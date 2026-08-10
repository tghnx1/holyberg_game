import Phaser from 'phaser';
import { MISS_WINDOW_MS, NOTE_TRAVEL_MS, RhythmDepth, SPAWN_AHEAD_MS } from './constants';
import { getDjMixLayout } from './DjMixLayout';
import type { ChartNote, NoteState, RhythmAction } from './types';

export interface ActiveDjAction extends ChartNote {
  id: string;
  state: NoteState;
  visual: Phaser.GameObjects.Container;
}

export class DjActionManager {
  private nextIndex = 0;
  private centerX = 0;
  readonly active: ActiveDjAction[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly actions: readonly ChartNote[],
    private readonly parent: Phaser.GameObjects.Container,
  ) {}

  setCenterX(centerX: number): void {
    const deltaX = centerX - this.centerX;
    this.centerX = centerX;
    for (const action of this.active) action.visual.x += deltaX;
  }

  update(currentTimeMs: number): ChartNote[] {
    while (this.nextIndex < this.actions.length && this.actions[this.nextIndex].timeMs - currentTimeMs <= SPAWN_AHEAD_MS) {
      this.spawn(this.actions[this.nextIndex]);
      this.nextIndex += 1;
    }
    const layout = getDjMixLayout(this.centerX);
    const nextAction = this.active
      .filter((action) => action.state === 'pending')
      .sort((a, b) => a.timeMs - b.timeMs)[0];
    for (const action of this.active) {
      action.visual.setVisible(action === nextAction);
      if (action !== nextAction) continue;
      const progress = Phaser.Math.Clamp(1 - (action.timeMs - currentTimeMs) / NOTE_TRAVEL_MS, 0, 1);
      const eased = Phaser.Math.Easing.Cubic.InOut(progress);
      if (action.action === 'tapLeft' || action.action === 'tapRight') {
        const left = action.action === 'tapLeft';
        const targetX = left ? layout.leftMarkerX : layout.rightMarkerX;
        action.visual.setPosition(targetX, layout.stripCenterY).setScale(0.68 + eased * 0.4).setAlpha(0.5 + eased * 0.5);
      } else {
        action.visual.setPosition(layout.centerX, layout.stripCenterY).setScale(0.72 + eased * 0.32).setAlpha(0.45 + eased * 0.55);
      }
    }
    const missed = this.active.filter((action) => action.state === 'pending' && currentTimeMs - action.timeMs > MISS_WINDOW_MS);
    for (const action of missed) this.resolve(action, 'missed');
    return missed;
  }

  nearestPending(action: RhythmAction, currentTimeMs: number): ActiveDjAction | undefined {
    return this.active
      .filter((candidate) => candidate.action === action && candidate.state === 'pending')
      .sort((a, b) => Math.abs(a.timeMs - currentTimeMs) - Math.abs(b.timeMs - currentTimeMs))[0];
  }

  resolve(action: ActiveDjAction, state: 'hit' | 'missed'): void {
    action.state = state;
    action.visual.destroy(true);
    const index = this.active.indexOf(action);
    if (index >= 0) this.active.splice(index, 1);
  }

  private spawn(action: ChartNote): void {
    const visual = this.createVisual(action.action);
    this.parent.add(visual);
    this.active.push({ ...action, id: `${action.timeMs}-${action.action}`, state: 'pending', visual });
  }

  private createVisual(action: RhythmAction): Phaser.GameObjects.Container {
    const tap = action === 'tapLeft' || action === 'tapRight';
    const color = action === 'tapLeft' ? 0xff8a3d : action === 'tapRight' ? 0x9d6cff : action === 'holdFx' ? 0xffdd57 : 0xff477e;
    const background = tap
      ? this.scene.add.circle(0, 0, 38, color, 0.96).setStrokeStyle(5, 0xffffff, 0.9)
      : this.scene.add.rectangle(0, 0, action === 'holdFx' ? 180 : 250, 66, color, 0.94).setStrokeStyle(4, 0xffffff, 0.9);
    const label = tap ? 'TAP' : action === 'swipeLeft' ? '←  SWIPE' : action === 'swipeRight' ? 'SWIPE  →' : 'HOLD';
    const text = this.scene.add.text(0, 0, label, { fontFamily: 'Archivo Black', fontSize: tap ? '15px' : '25px', color: '#100818' }).setOrigin(0.5);
    return this.scene.add.container(this.centerX, 630, [background, text]).setDepth(RhythmDepth.NOTES).setVisible(false);
  }
}
