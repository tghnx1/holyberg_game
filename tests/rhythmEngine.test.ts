import { describe, expect, it } from 'vitest';
import { RhythmEngine } from '../src/game/rhythm/RhythmEngine';
import type { RhythmNote } from '../src/game/rhythm/types';

const note = (time: number, lane: RhythmNote['lane']): RhythmNote => ({
  time,
  lane,
  duration: 0.1,
  velocity: 1,
});

describe('RhythmEngine note lifecycle', () => {
  it('cannot hit one note twice', () => {
    const engine = new RhythmEngine([note(1, 0)]);
    expect(engine.hitLane(0, 1)?.judgement).toBe('PERFECT');
    expect(engine.hitLane(0, 1)).toBeNull();
    expect(engine.judgedCount).toBe(1);
  });

  it('cannot miss one note twice', () => {
    const engine = new RhythmEngine([note(1, 0)]);
    expect(engine.update(1.181)).toHaveLength(1);
    expect(engine.update(2)).toHaveLength(0);
    expect(engine.judgedCount).toBe(1);
  });

  it('finds the closest hittable pending note in the pressed lane', () => {
    const engine = new RhythmEngine([note(1, 0), note(1.12, 0), note(1.05, 1)]);
    const result = engine.hitLane(0, 1.1);
    expect(result?.note.time).toBe(1.12);
    expect(result?.judgement).toBe('PERFECT');
  });

  it('marks all remaining notes once when audio ends', () => {
    const engine = new RhythmEngine([note(1, 0), note(2, 1)]);
    expect(engine.missRemaining()).toHaveLength(2);
    expect(engine.missRemaining()).toHaveLength(0);
    expect(engine.allNotesJudged).toBe(true);
  });
});
