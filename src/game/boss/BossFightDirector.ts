/**
 * Runs the fight: advances attacks through their phases, resolves laser hits
 * and awards score. Deliberately free of Phaser so the whole rule set is unit
 * testable; the scene consumes the emitted events to draw and shake things.
 */
import {
  getActiveEndMs,
  getAttackBeams,
  getAttackPhase,
  isPlayerHitByBeams,
} from './attackRuntime';
import { applyDodge, applyFightEnd, applyLaserHit, initialBossScoreState } from './BossScoreSystem';
import type { BossScoreState } from './BossScoreSystem';
import { BOSS_PLAYER } from './bossConfig';
import { buildFightPlan, getPhaseAt } from './fightSequence';
import type { FightPlan } from './fightSequence';
import type { ActiveAttack, ArenaBounds, BossPhaseDefinition } from './types';

export type BossFightEvent =
  | { kind: 'telegraphStarted'; attack: ActiveAttack }
  | { kind: 'attackActivated'; attack: ActiveAttack }
  | { kind: 'attackResolved'; attack: ActiveAttack; dodged: boolean }
  | { kind: 'playerHit'; attack: ActiveAttack; beamCenterX: number; hitPoints: number }
  | { kind: 'phaseChanged'; phase: BossPhaseDefinition }
  | { kind: 'fightEnded'; survived: boolean };

export interface BossFightSnapshot {
  elapsedMs: number;
  remainingMs: number;
  hitPoints: number;
  score: BossScoreState;
  phase: BossPhaseDefinition;
  finished: boolean;
  activeAttacks: readonly ActiveAttack[];
}

export class BossFightDirector {
  private readonly plan: FightPlan;
  private readonly live: ActiveAttack[] = [];
  private nextAttackIndex = 0;
  private scoreState = initialBossScoreState();
  private hitPoints: number = BOSS_PLAYER.hitPoints;
  private invulnerableUntilMs = -Infinity;
  private elapsedMs = 0;
  private currentPhase: BossPhaseDefinition;
  private finished = false;
  private survived = false;

  constructor(
    private readonly bounds: ArenaBounds,
    seed = 1,
  ) {
    this.plan = buildFightPlan(bounds, seed);
    this.currentPhase = getPhaseAt(0);
  }

  get snapshot(): BossFightSnapshot {
    return {
      elapsedMs: this.elapsedMs,
      remainingMs: Math.max(0, this.plan.totalDurationMs - this.elapsedMs),
      hitPoints: this.hitPoints,
      score: this.scoreState,
      phase: this.currentPhase,
      finished: this.finished,
      activeAttacks: this.live,
    };
  }

  get totalDurationMs(): number {
    return this.plan.totalDurationMs;
  }

  isInvulnerable(nowMs: number): boolean {
    return nowMs < this.invulnerableUntilMs;
  }

  /**
   * Advances the fight by `deltaMs`.
   *
   * `playerCenterX` is sampled once per frame and used both to aim telegraphs
   * and to resolve collisions, so what the player sees is what they are hit by.
   */
  update(deltaMs: number, playerCenterX: number): BossFightEvent[] {
    const events: BossFightEvent[] = [];
    if (this.finished) return events;

    this.elapsedMs += deltaMs;
    const now = this.elapsedMs;

    const phase = getPhaseAt(now);
    if (phase.index !== this.currentPhase.index) {
      this.currentPhase = phase;
      events.push({ kind: 'phaseChanged', phase });
    }

    this.spawnDueAttacks(now, playerCenterX, events);
    this.advanceAttacks(now, playerCenterX, events);

    if (this.hitPoints <= 0) {
      this.endFight(false, events);
      return events;
    }
    if (now >= this.plan.totalDurationMs && this.live.length === 0) {
      this.endFight(true, events);
    }
    return events;
  }

  /** Telegraphs begin exactly at their scheduled time; aimed shots lock on now. */
  private spawnDueAttacks(
    now: number,
    playerCenterX: number,
    events: BossFightEvent[],
  ): void {
    while (this.nextAttackIndex < this.plan.attacks.length) {
      const scheduled = this.plan.attacks[this.nextAttackIndex];
      if (scheduled.startMs > now) break;
      this.nextAttackIndex += 1;
      const attack: ActiveAttack = {
        ...scheduled,
        params:
          scheduled.params.type === 'aimedLaser'
            ? { ...scheduled.params, targetX: this.clampToArena(playerCenterX) }
            : scheduled.params,
        phase: 'telegraph',
        hitPlayer: false,
        scored: false,
      };
      this.live.push(attack);
      events.push({ kind: 'telegraphStarted', attack });
    }
  }

  private advanceAttacks(
    now: number,
    playerCenterX: number,
    events: BossFightEvent[],
  ): void {
    for (let index = this.live.length - 1; index >= 0; index -= 1) {
      const attack = this.live[index];
      const nextPhase = getAttackPhase(attack, now);
      if (nextPhase !== attack.phase) {
        attack.phase = nextPhase;
        if (nextPhase === 'active') events.push({ kind: 'attackActivated', attack });
      }

      if (nextPhase === 'active') this.resolveDamage(attack, now, playerCenterX, events);

      // Score the attack the instant its damage window shuts, not when the
      // recovery ends, so feedback lands while the moment is still readable.
      if (!attack.scored && now >= getActiveEndMs(attack)) {
        attack.scored = true;
        const dodged = !attack.hitPlayer;
        if (dodged) this.scoreState = applyDodge(this.scoreState);
        events.push({ kind: 'attackResolved', attack, dodged });
      }

      if (nextPhase === 'done') this.live.splice(index, 1);
    }
  }

  private resolveDamage(
    attack: ActiveAttack,
    now: number,
    playerCenterX: number,
    events: BossFightEvent[],
  ): void {
    // One hit per attack: a wall you are standing in should cost one HP, not
    // one per frame.
    if (attack.hitPlayer || this.isInvulnerable(now)) return;
    const beams = getAttackBeams(attack);
    if (!isPlayerHitByBeams(beams, playerCenterX, BOSS_PLAYER.hitHalfWidth)) return;

    attack.hitPlayer = true;
    this.hitPoints = Math.max(0, this.hitPoints - 1);
    this.scoreState = applyLaserHit(this.scoreState);
    this.invulnerableUntilMs = now + BOSS_PLAYER.invulnerabilityMs;
    const nearest = beams.reduce((closest, beam) =>
      Math.abs(beam.centerX - playerCenterX) < Math.abs(closest.centerX - playerCenterX)
        ? beam
        : closest,
    );
    events.push({
      kind: 'playerHit',
      attack,
      beamCenterX: nearest.centerX,
      hitPoints: this.hitPoints,
    });
  }

  private endFight(survived: boolean, events: BossFightEvent[]): void {
    this.finished = true;
    this.survived = survived;
    this.scoreState = applyFightEnd(this.scoreState, survived);
    events.push({ kind: 'fightEnded', survived });
  }

  get result(): { score: BossScoreState; survived: boolean } {
    return { score: this.scoreState, survived: this.survived };
  }

  private clampToArena(x: number): number {
    return Math.min(this.bounds.maxX, Math.max(this.bounds.minX, x));
  }
}
