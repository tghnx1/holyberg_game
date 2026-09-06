import { describe, expect, it } from 'vitest';
import { getCharacter } from '../src/game/characters/characterRegistry';
import { DAMAGE_CYCLE_MS, WALK_CYCLE_MS, RUN_CYCLE_MS } from '../src/game/characters/characterAnimation';
import {
  resolveLocomotionFrame,
  resolveLocomotionPose,
} from '../src/game/characters/characterLocomotion';

/**
 * The connective levels (Level 2's club, Level 4's toilet) move the player by
 * hand and should draw the discovered walk artwork. Both previously looped the
 * run cycle instead, leaving `gameplay/walk/` discovered but rendered by
 * nothing.
 */
describe('walking in the connective levels', () => {
  it('draws the walk set for a character that has one', () => {
    const atmos = getCharacter('atmos');
    expect(atmos.capabilities.walkAnimation).toBe(true);

    const walkKeys = new Set(atmos.gameplay.walk.map((frame) => frame.key));
    expect(walkKeys.size).toBeGreaterThan(1);
    for (let i = 0; i < 5; i += 1) {
      const frame = resolveLocomotionFrame(atmos, 'walk', (WALK_CYCLE_MS * i) / 5);
      expect(walkKeys.has(frame.key)).toBe(true);
    }
  });

  it('advances through every walk frame across one cycle', () => {
    const atmos = getCharacter('atmos');
    const seen = new Set<string>();
    for (let t = 0; t < WALK_CYCLE_MS; t += WALK_CYCLE_MS / 40) {
      seen.add(resolveLocomotionFrame(atmos, 'walk', t).key);
    }
    expect(seen.size).toBe(atmos.gameplay.walk.length);
  });

  it('walks at a slower cadence than it runs', () => {
    expect(WALK_CYCLE_MS).toBeGreaterThan(RUN_CYCLE_MS);
  });

  it('stands on the idle frame when not moving', () => {
    const atmos = getCharacter('atmos');
    expect(resolveLocomotionFrame(atmos, 'idle', 1234).key).toBe(atmos.gameplay.idle!.key);
    expect(resolveLocomotionPose(atmos, 'idle')).toBe('idle');
  });

  it('reports the pose it actually draws, so scaling follows the artwork', () => {
    const atmos = getCharacter('atmos');
    expect(resolveLocomotionPose(atmos, 'walk')).toBe('walk');

    // Klaus has no walk set, so it falls back to the run frames and must say so
    // rather than asking for a `walk` scale override that does not apply.
    const klaus = getCharacter('klaus');
    expect(klaus.capabilities.walkAnimation).toBe(false);
    expect(resolveLocomotionPose(klaus, 'walk')).toBe('run');
  });

  it('holds on the first damage frame for every playable character when no reaction start time is given', () => {
    // playable gates on having at least one damage frame, so this must hold
    // for every playable character, not just one hand-picked example. No 4th
    // argument defaults `damageStartedAtMs` to `now`, i.e. elapsed 0 — this
    // is the "just show me the pose" call shape, distinct from an animated
    // reaction (see the next test).
    for (const character of ['atmos', 'klaus', 'doctor-doms'] as const) {
      const def = getCharacter(character);
      expect(def.capabilities.playable).toBe(true);
      expect(resolveLocomotionPose(def, 'damage')).toBe('damage');
      const frame = resolveLocomotionFrame(def, 'damage', 999);
      expect(frame.key).toBe(def.gameplay.damage[0].key);
      expect(resolveLocomotionFrame(def, 'damage', 5000).key).toBe(frame.key);
    }
  });

  it('animates through every discovered damage frame once the reaction start time is passed', () => {
    const atmos = getCharacter('atmos');
    expect(atmos.gameplay.damage.length).toBeGreaterThan(1);
    const damageKeys = new Set(atmos.gameplay.damage.map((frame) => frame.key));
    const startedAt = 1000;

    const seen = new Set<string>();
    for (let now = startedAt; now < startedAt + DAMAGE_CYCLE_MS; now += 10) {
      const frame = resolveLocomotionFrame(atmos, 'damage', now, startedAt);
      expect(damageKeys.has(frame.key)).toBe(true);
      seen.add(frame.key);
    }
    expect(seen.size).toBe(atmos.gameplay.damage.length);
    expect(resolveLocomotionFrame(atmos, 'damage', startedAt, startedAt).key).toBe(
      atmos.gameplay.damage[0].key,
    );
    // Holds the last frame rather than looping once the cycle has finished.
    expect(resolveLocomotionFrame(atmos, 'damage', startedAt + 10_000, startedAt).key).toBe(
      atmos.gameplay.damage.at(-1)!.key,
    );
  });

  it('falls back to run frames rather than freezing without a walk set', () => {
    const klaus = getCharacter('klaus');
    const runKeys = new Set(klaus.gameplay.run.map((frame) => frame.key));
    const seen = new Set<string>();
    for (let t = 0; t < RUN_CYCLE_MS; t += RUN_CYCLE_MS / 20) {
      const frame = resolveLocomotionFrame(klaus, 'walk', t);
      expect(runKeys.has(frame.key)).toBe(true);
      seen.add(frame.key);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
