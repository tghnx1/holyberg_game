import { describe, expect, it } from 'vitest';
import {
  airborneFrameCount,
  CROUCH_CYCLE_MS,
  footOffset,
  JUMP_AIRBORNE_MS,
  JUMP_LANDING_HOLD_MS,
  jumpFrameIndex,
  landingFrameIndex,
  loopedFrameIndex,
  RUN_CYCLE_MS,
  staticRunFrameIndex,
} from '../src/game/characters/characterAnimation';
import { getCharacter } from '../src/game/characters/characterRegistry';

describe('cycle durations are gameplay constants, not character data', () => {
  it('preserves Atmos-derived tempos', () => {
    expect(RUN_CYCLE_MS).toBe(92 * 6);
    expect(CROUCH_CYCLE_MS).toBe(110 * 3);
    expect(JUMP_AIRBORNE_MS).toBe(70 * 4);
    expect(JUMP_LANDING_HOLD_MS).toBe(120);
  });
});

describe('looping frame resolution', () => {
  it('covers every frame exactly once per cycle, for any count', () => {
    for (const count of [1, 2, 4, 6, 8]) {
      const seen = new Set<number>();
      for (let t = 0; t < RUN_CYCLE_MS; t += 1) {
        seen.add(loopedFrameIndex(t, count, RUN_CYCLE_MS));
      }
      expect([...seen].sort((a, b) => a - b)).toEqual(
        Array.from({ length: count }, (_, i) => i),
      );
    }
  });

  it('completes the run cycle in 552 ms whatever the frame count', () => {
    for (const count of [1, 2, 4, 6, 8]) {
      // Same phase one cycle later.
      for (const t of [0, 137, 411]) {
        expect(loopedFrameIndex(t, count, RUN_CYCLE_MS)).toBe(
          loopedFrameIndex(t + RUN_CYCLE_MS, count, RUN_CYCLE_MS),
        );
      }
      // The last frame is still showing immediately before the wrap.
      expect(loopedFrameIndex(RUN_CYCLE_MS - 1, count, RUN_CYCLE_MS)).toBe(count - 1);
      expect(loopedFrameIndex(RUN_CYCLE_MS, count, RUN_CYCLE_MS)).toBe(0);
    }
  });

  it('completes the crouch cycle in 330 ms whatever the frame count', () => {
    for (const count of [1, 3, 5]) {
      expect(loopedFrameIndex(CROUCH_CYCLE_MS - 1, count, CROUCH_CYCLE_MS)).toBe(count - 1);
      expect(loopedFrameIndex(CROUCH_CYCLE_MS, count, CROUCH_CYCLE_MS)).toBe(0);
    }
  });

  it('reproduces the previous per-frame maths exactly for Atmos', () => {
    // Old behaviour: floor(now / 92) % 6 for run, floor(now / 110) % 3 for crouch.
    for (let t = 0; t < 4000; t += 7) {
      expect(loopedFrameIndex(t, 6, RUN_CYCLE_MS)).toBe(Math.floor(t / 92) % 6);
      expect(loopedFrameIndex(t, 3, CROUCH_CYCLE_MS)).toBe(Math.floor(t / 110) % 3);
    }
  });

  it('is safe with no frames or a zero cycle', () => {
    expect(loopedFrameIndex(100, 0, RUN_CYCLE_MS)).toBe(0);
    expect(loopedFrameIndex(100, 6, 0)).toBe(0);
  });
});

describe('jump frames', () => {
  it('reserves the last frame for landing', () => {
    expect(airborneFrameCount(5)).toBe(4);
    expect(landingFrameIndex(5)).toBe(4);
    expect(airborneFrameCount(3)).toBe(2);
    expect(landingFrameIndex(3)).toBe(2);
  });

  it('never returns the landing frame while airborne, for any count', () => {
    for (const count of [2, 3, 5, 9]) {
      const landing = landingFrameIndex(count);
      for (let t = 0; t < 3000; t += 5) {
        expect(jumpFrameIndex(t, count)).toBeLessThan(landing);
      }
    }
  });

  it('spans the airborne sequence over 280 ms whatever the frame count', () => {
    for (const count of [2, 3, 5, 9]) {
      const airborne = airborneFrameCount(count);
      expect(jumpFrameIndex(0, count)).toBe(0);
      // Just before the end of the sequence the last airborne frame is up.
      expect(jumpFrameIndex(JUMP_AIRBORNE_MS - 1, count)).toBe(airborne - 1);
      // And it holds from there on, rather than advancing into landing.
      expect(jumpFrameIndex(JUMP_AIRBORNE_MS * 4, count)).toBe(airborne - 1);
    }
  });

  it('reproduces Atmos’s previous 70 ms-per-frame ascent', () => {
    for (let t = 0; t < 600; t += 3) {
      expect(jumpFrameIndex(t, 5)).toBe(Math.min(3, Math.floor(t / 70)));
    }
  });

  it('handles a single-frame jump without reserving it away', () => {
    expect(airborneFrameCount(1)).toBe(1);
    expect(jumpFrameIndex(0, 1)).toBe(0);
    expect(jumpFrameIndex(500, 1)).toBe(0);
  });

  it('clamps a negative elapsed time to the first frame', () => {
    expect(jumpFrameIndex(-1000, 5)).toBe(0);
  });
});

describe('static run pose', () => {
  it('is the middle of the cycle, which is Atmos’s frame 3 of 6', () => {
    expect(staticRunFrameIndex(6)).toBe(2);
    expect(staticRunFrameIndex(4)).toBe(1);
    expect(staticRunFrameIndex(2)).toBe(0);
    expect(staticRunFrameIndex(1)).toBe(0);
  });
});

describe('foot offsets', () => {
  it('scales the source-pixel gap by the presentation scale', () => {
    expect(footOffset(15, 0.8)).toBeCloseTo(12);
    expect(footOffset(15, 1.8)).toBeCloseTo(27);
    expect(footOffset(0, 0.8)).toBe(0);
  });
});

describe('character data carries no gameplay values', () => {
  it('exposes only artwork and capabilities', () => {
    const atmos = getCharacter('atmos');
    expect(Object.keys(atmos).sort()).toEqual([
      'capabilities',
      'dialogue',
      'gameplay',
      'id',
      'name',
      'presentation',
      'rootUrl',
    ]);
    expect(atmos.presentation.gameplayScale).toBe(0.8);
    expect(atmos.presentation.dialogueScale).toBeCloseTo(1.857, 3);
    for (const frame of atmos.gameplay.run) {
      expect(Object.keys(frame).sort()).toEqual(['footGap', 'key', 'url']);
    }
  });

  it('has no per-character duration, speed or physics anywhere in a frame', () => {
    const atmos = getCharacter('atmos');
    const everyFrame = [
      ...atmos.gameplay.run,
      ...atmos.gameplay.jump,
      ...atmos.gameplay.crouch,
      ...atmos.gameplay.damage,
    ];
    for (const frame of everyFrame) {
      for (const banned of ['duration', 'speed', 'gravity', 'scale', 'velocity']) {
        expect(frame).not.toHaveProperty(banned);
      }
    }
  });

  it('uses only the first damage frame, leaving the rest discovered but unplayed', () => {
    const atmos = getCharacter('atmos');
    expect(atmos.gameplay.damage.length).toBeGreaterThan(1);
    expect(atmos.gameplay.damage[0].key).toBe('character:atmos:gameplay:damage:01');
  });
});
