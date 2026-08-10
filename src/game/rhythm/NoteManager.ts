import Phaser from 'phaser';
import { LANE_COLORS, MISS_WINDOW_MS, NOTE_TRAVEL_MS, RhythmDepth, SPAWN_AHEAD_MS } from './constants';
import { getPerspectivePosition } from './PerspectiveMath';
import type { ChartNote, Lane, NoteState } from './types';

export interface ActiveNote extends ChartNote {
  id: string;
  state: NoteState;
  visual: Phaser.GameObjects.Container;
}

export class NoteManager {
  private nextIndex = 0;
  readonly active: ActiveNote[] = [];
  private screenCenterX = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly notes: readonly ChartNote[],
    private readonly parent?: Phaser.GameObjects.Container,
  ) {}

  setCenterX(screenCenterX: number): void {
    const deltaX = screenCenterX - this.screenCenterX;
    this.screenCenterX = screenCenterX;
    for (const note of this.active) note.visual.x += deltaX;
  }

  update(currentTimeMs: number): ChartNote[] {
    while (
      this.nextIndex < this.notes.length &&
      this.notes[this.nextIndex].timeMs - currentTimeMs <= SPAWN_AHEAD_MS
    ) {
      this.spawn(this.notes[this.nextIndex]);
      this.nextIndex += 1;
    }
    for (const note of this.active) {
      const progress = 1 - (note.timeMs - currentTimeMs) / NOTE_TRAVEL_MS;
      const position = getPerspectivePosition(note.lane, progress, this.screenCenterX);
      note.visual.setPosition(position.x, position.y).setScale(position.scale);
      note.visual.setDepth(RhythmDepth.NOTES + Math.round(position.progress * 40));
    }
    const missed = this.active.filter(
      (note) => note.state === 'pending' && currentTimeMs - note.timeMs > MISS_WINDOW_MS,
    );
    for (const note of missed) this.resolve(note, 'missed');
    return missed;
  }

  closestPending(lane: Lane): ActiveNote | undefined {
    return this.active
      .filter((note) => note.lane === lane && note.state === 'pending')
      .sort((a, b) => a.timeMs - b.timeMs)[0];
  }

  nearestPending(lane: Lane, currentTimeMs: number): ActiveNote | undefined {
    return this.active
      .filter((note) => note.lane === lane && note.state === 'pending')
      .sort((a, b) => Math.abs(a.timeMs - currentTimeMs) - Math.abs(b.timeMs - currentTimeMs))[0];
  }

  resolve(note: ActiveNote, state: 'hit' | 'missed'): void {
    note.state = state;
    note.visual.destroy();
    const index = this.active.indexOf(note);
    if (index >= 0) this.active.splice(index, 1);
  }

  get finished(): boolean {
    return this.nextIndex >= this.notes.length && this.active.length === 0;
  }

  private spawn(note: ChartNote): void {
    const color = LANE_COLORS[note.lane];
    const shape = this.createShape(note.lane, color);
    const symbol = this.scene.add
      .text(0, 0, ['●', '■', '▲', '◆'][note.lane], {
        fontFamily: 'Arial',
        fontSize: '28px',
        color: '#120b20',
      })
      .setOrigin(0.5);
    const position = getPerspectivePosition(note.lane, 0, this.screenCenterX);
    const visual = this.scene.add.container(position.x, position.y, [shape, symbol]).setScale(position.scale).setDepth(RhythmDepth.NOTES);
    this.parent?.add(visual);
    this.active.push({ ...note, id: `${note.timeMs}-${note.lane}`, state: 'pending', visual });
  }

  private createShape(lane: Lane, color: number): Phaser.GameObjects.Shape {
    if (lane === 0) return this.scene.add.circle(0, 0, 32, color);
    if (lane === 1) return this.scene.add.rectangle(0, 0, 62, 62, color);
    if (lane === 2) return this.scene.add.triangle(0, 0, 0, 62, 31, 0, 62, 62, color);
    return this.scene.add.rectangle(0, 0, 50, 50, color).setAngle(45);
  }
}
