import Phaser from 'phaser';
import { LANE_COLORS, NOTE_TRAVEL_SECONDS, RhythmDepth, SPAWN_AHEAD_SECONDS } from './constants';
import { getPerspectivePosition } from './PerspectiveMath';
import type { RuntimeRhythmNote } from './types';

export interface ActiveNote {
  note: RuntimeRhythmNote;
  visual: Phaser.GameObjects.Container;
}

export class NoteManager {
  private nextIndex = 0;
  readonly active: ActiveNote[] = [];
  private screenCenterX = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly notes: readonly RuntimeRhythmNote[],
    private readonly parent?: Phaser.GameObjects.Container,
    private readonly lookAheadSeconds = SPAWN_AHEAD_SECONDS,
    private readonly travelSeconds = NOTE_TRAVEL_SECONDS,
  ) {}

  setCenterX(screenCenterX: number): void {
    const deltaX = screenCenterX - this.screenCenterX;
    this.screenCenterX = screenCenterX;
    for (const note of this.active) note.visual.x += deltaX;
  }

  update(currentTime: number): void {
    while (
      this.nextIndex < this.notes.length &&
      this.notes[this.nextIndex].time - currentTime <= this.lookAheadSeconds
    ) {
      const note = this.notes[this.nextIndex];
      if (note.state === 'pending') this.spawn(note);
      this.nextIndex += 1;
    }
    for (const activeNote of this.active) {
      const progress = 1 - (activeNote.note.time - currentTime) / this.travelSeconds;
      const position = getPerspectivePosition(activeNote.note.lane, progress, this.screenCenterX);
      activeNote.visual.setPosition(position.x, position.y).setScale(position.scale);
      activeNote.visual.setDepth(RhythmDepth.NOTES + Math.round(position.progress * 40));
    }
  }

  resolve(noteId: number): void {
    const index = this.active.findIndex((activeNote) => activeNote.note.id === noteId);
    if (index < 0) return;
    this.active[index].visual.destroy();
    this.active.splice(index, 1);
  }

  get activeCount(): number {
    return this.active.length;
  }

  destroy(): void {
    for (const activeNote of this.active) activeNote.visual.destroy();
    this.active.length = 0;
  }

  private spawn(note: RuntimeRhythmNote): void {
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
    this.active.push({ note, visual });
  }

  private createShape(lane: RuntimeRhythmNote['lane'], color: number): Phaser.GameObjects.Shape {
    if (lane === 0) return this.scene.add.circle(0, 0, 32, color);
    if (lane === 1) return this.scene.add.rectangle(0, 0, 62, 62, color);
    if (lane === 2) return this.scene.add.triangle(0, 0, 0, 62, 31, 0, 62, 62, color);
    return this.scene.add.rectangle(0, 0, 50, 50, color).setAngle(45);
  }
}
