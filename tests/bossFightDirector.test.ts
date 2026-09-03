import { describe, expect, it } from 'vitest';
import { getAttackBeams } from '../src/game/boss/attackRuntime';
import { BossFightDirector } from '../src/game/boss/BossFightDirector';
import { BOSS_PLAYER, BOSS_SCORING } from '../src/game/boss/bossConfig';
import type { ArenaBounds, ScheduledAttack } from '../src/game/boss/types';

const bounds: ArenaBounds = { minX: 70, maxX: 1210 };
const FRAME_MS = 16;

/**
 * Picks the arena position furthest from every beam the fight is currently
 * projecting. It reads the director's own live attacks, so an aimed laser is
 * dodged the way a player dodges one: react after the telegraph locks on.
 *
 * Movement speed is ignored on purpose — wall gap width has a dedicated
 * fairness test — so this isolates "does a safe spot exist at all?".
 */
function findSafestX(live: readonly ScheduledAttack[]): number {
  let best = bounds.minX;
  let bestClearance = -Infinity;
  for (let x = bounds.minX; x <= bounds.maxX; x += 10) {
    let clearance = Infinity;
    for (const attack of live) {
      for (const beam of getAttackBeams(attack)) {
        clearance = Math.min(clearance, Math.abs(beam.centerX - x) - beam.halfWidth);
      }
    }
    if (clearance > bestClearance) {
      bestClearance = clearance;
      best = x;
    }
  }
  return best;
}

/** Runs the fight to completion with a player-position strategy per frame. */
function simulate(playerXAt: (elapsedMs: number) => number, seed = 1) {
  const director = new BossFightDirector(bounds, seed);
  let elapsed = 0;
  let guard = 0;
  while (!director.snapshot.finished && guard < 100_000) {
    elapsed += FRAME_MS;
    director.update(FRAME_MS, playerXAt(elapsed));
    guard += 1;
  }
  return director;
}

describe('boss fight director', () => {
  it('a player who always moves to the safe spot finishes flawless', () => {
    const director = new BossFightDirector(bounds, 1);
    let elapsed = 0;
    let guard = 0;
    while (!director.snapshot.finished && guard < 100_000) {
      const snapshot = director.snapshot;
      const x = findSafestX(snapshot.activeAttacks);
      elapsed += FRAME_MS;
      director.update(FRAME_MS, x);
      guard += 1;
    }
    expect(elapsed).toBeGreaterThan(0);
    const { score } = director.result;
    expect(score.finished).toBe(true);
    expect(score.hits).toBe(0);
    expect(score.dodges).toBeGreaterThan(10);
    expect(score.score).toBeGreaterThan(
      BOSS_SCORING.survivalBonus + BOSS_SCORING.flawlessBonus,
    );
  });

  it('a motionless player takes hits and still reaches the end of the fight', () => {
    const director = simulate(() => 640);
    const { score } = director.result;
    expect(score.hits).toBeGreaterThan(0);
    // The whole point: no number of hits can cut the fight short.
    expect(director.snapshot.finished).toBe(true);
    expect(director.snapshot.elapsedMs).toBeGreaterThanOrEqual(director.totalDurationMs);
    expect(score.finished).toBe(true);
  });

  it('uses the live visual hurtbox width supplied by the player renderer', () => {
    const narrow = new BossFightDirector(bounds, 1);
    const wide = new BossFightDirector(bounds, 1);
    let narrowHits = 0;
    let wideHits = 0;

    for (let frame = 0; frame < 500 && narrowHits === 0 && wideHits === 0; frame += 1) {
      const telegraph = wide.snapshot.activeAttacks[0];
      const beam = telegraph ? getAttackBeams(telegraph)[0] : undefined;
      const edgeX = beam ? beam.centerX + beam.halfWidth + 10 : bounds.minX;
      narrowHits += narrow.update(FRAME_MS, edgeX, 5)
        .filter((event) => event.kind === 'playerHit').length;
      wideHits += wide.update(FRAME_MS, edgeX, 20)
        .filter((event) => event.kind === 'playerHit').length;
    }

    expect(narrowHits).toBe(0);
    expect(wideHits).toBe(1);
  });

  it('awards the survival bonus however many times the player was hit', () => {
    const director = simulate(() => 640);
    const { score } = director.result;
    expect(score.hits).toBeGreaterThan(0);
    // Hit repeatedly, so no flawless bonus — but the fight was still finished.
    expect(score.score).toBeGreaterThanOrEqual(BOSS_SCORING.survivalBonus);
  });

  it('banks emeralds through the same score state as dodges and hits', () => {
    const director = new BossFightDirector(bounds, 1);
    director.update(FRAME_MS, 640);
    director.collectEmerald();
    director.collectEmerald();
    expect(director.snapshot.score.emeralds).toBe(2);
    expect(director.snapshot.score.emeraldScore).toBe(BOSS_SCORING.emeraldScore * 2);
    expect(director.snapshot.score.score).toBe(BOSS_SCORING.emeraldScore * 2);
  });

  it('grants invulnerability after a hit so one wall is not several penalties', () => {
    const director = new BossFightDirector(bounds, 1);
    let elapsed = 0;
    let firstHitAt = -1;
    for (let frame = 0; frame < 4000; frame += 1) {
      elapsed += FRAME_MS;
      const events = director.update(FRAME_MS, 640);
      const hit = events.find((event) => event.kind === 'playerHit');
      if (hit && firstHitAt < 0) firstHitAt = elapsed;
      if (hit && firstHitAt >= 0 && elapsed > firstHitAt) {
        expect(elapsed - firstHitAt).toBeGreaterThanOrEqual(BOSS_PLAYER.invulnerabilityMs);
        break;
      }
    }
    expect(firstHitAt).toBeGreaterThan(0);
  });

  it('scores nothing for time passing, only for resolved attacks', () => {
    const director = new BossFightDirector(bounds, 1);
    // Well before the first attack resolves.
    director.update(500, 640);
    expect(director.snapshot.score.score).toBe(0);
    expect(director.snapshot.score.dodges).toBe(0);
  });

  it('is deterministic: identical inputs give an identical score', () => {
    const first = simulate((elapsed) => 300 + Math.sin(elapsed / 400) * 200);
    const second = simulate((elapsed) => 300 + Math.sin(elapsed / 400) * 200);
    expect(first.result.score).toEqual(second.result.score);
  });

  it('emits a phase change for every escalation', () => {
    const director = new BossFightDirector(bounds, 1);
    const phases: number[] = [];
    let guard = 0;
    while (!director.snapshot.finished && guard < 100_000) {
      const snapshot = director.snapshot;
      const x = findSafestX(snapshot.activeAttacks);
      for (const event of director.update(FRAME_MS, x)) {
        if (event.kind === 'phaseChanged') phases.push(event.phase.index);
      }
      guard += 1;
    }
    expect(phases).toEqual([1, 2, 3]);
  });
});
