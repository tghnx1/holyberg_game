import { MAX_HIT_WINDOW_MS } from './constants';
import { judgeTiming } from './JudgementSystem';
import type { Judgement, Lane, RhythmNote, RuntimeRhythmNote } from './types';

export interface HitResult {
  note: RuntimeRhythmNote;
  judgement: Exclude<Judgement, 'MISS'>;
  differenceMs: number;
}

export class RhythmEngine {
  readonly notes: RuntimeRhythmNote[];
  private nextOverdueIndex = 0;

  constructor(notes: readonly RhythmNote[]) {
    this.notes = [...notes]
      .sort((left, right) => left.time - right.time || left.lane - right.lane)
      .map((note, id) => ({ ...note, id, state: 'pending' }));
  }

  hitLane(lane: Lane, effectiveSongTime: number): HitResult | null {
    let closest: RuntimeRhythmNote | undefined;
    let closestDifference = Infinity;
    for (const note of this.notes) {
      if (note.state !== 'pending' || note.lane !== lane) continue;
      const difference = Math.abs(note.time - effectiveSongTime);
      if (difference < closestDifference) {
        closest = note;
        closestDifference = difference;
      }
    }
    if (!closest) return null;

    const differenceMs = (effectiveSongTime - closest.time) * 1000;
    const judgement = judgeTiming(differenceMs);
    if (!judgement) return null;
    closest.state = 'hit';
    return { note: closest, judgement, differenceMs };
  }

  update(songTime: number): RuntimeRhythmNote[] {
    const missed: RuntimeRhythmNote[] = [];
    const overdueBefore = songTime - MAX_HIT_WINDOW_MS / 1000;
    while (
      this.nextOverdueIndex < this.notes.length &&
      this.notes[this.nextOverdueIndex].time < overdueBefore
    ) {
      const note = this.notes[this.nextOverdueIndex];
      if (note.state === 'pending') {
        note.state = 'missed';
        missed.push(note);
      }
      this.nextOverdueIndex += 1;
    }
    return missed;
  }

  missRemaining(): RuntimeRhythmNote[] {
    const missed = this.notes.filter((note) => note.state === 'pending');
    for (const note of missed) note.state = 'missed';
    this.nextOverdueIndex = this.notes.length;
    return missed;
  }

  get nextPendingNote(): RuntimeRhythmNote | undefined {
    return this.notes.find((note) => note.state === 'pending');
  }

  get judgedCount(): number {
    return this.notes.reduce((total, note) => total + (note.state === 'pending' ? 0 : 1), 0);
  }

  get allNotesJudged(): boolean {
    return this.judgedCount === this.notes.length;
  }
}
