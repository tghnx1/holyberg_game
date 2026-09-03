import Phaser from 'phaser';
import {
  footOffset,
  loopedFrameIndex,
  RUN_CYCLE_MS,
  staticRunFrameIndex,
} from '../characters/characterAnimation';
import type { CharacterAssetRef, CharacterDefinition } from '../characters/characterManifest';
import { resolveGameplayScale } from '../characters/characterManifest';
import { BOSS_ARENA, BOSS_PLAYER } from './bossConfig';

import { BossDepth } from './bossConstants';
import {
  applyKnockback,
  createBossPlayerMotion,
  stepBossPlayer,
  type BossPlayerMotion,
  type MoveDirection,
} from './bossPlayerMovement';
import type { ArenaBounds } from './types';

const ENTRANCE_FALL_DURATION_MS = 900;
const ENTRANCE_FALL_START_OFFSET_Y = -800;

type BossPlayerPose = 'idle' | 'run' | 'damage';

/**
 * The selected character in the boss arena.
 *
 * This deliberately does not extend the Level 1 `Player`: there is no gravity,
 * jumping, dashing or Arcade body here, only a horizontal dodge. It reuses the
 * shared
 * the character's own frame data so it looks and aligns to the floor exactly as it
 * does in Level 1.
 */
export class BossPlayer {
  private motion: BossPlayerMotion;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private currentFrameKey?: string;
  private presentation = { offsetX: 0, offsetY: 0, scale: 1 };
  private damageFrameUntilMs = -Infinity;
  private currentPose: BossPlayerPose = 'idle';
  private entranceStartedAtMs?: number;

  constructor(
    private readonly scene: Phaser.Scene,
    startX: number,
    private readonly character: CharacterDefinition,
  ) {
    this.motion = createBossPlayerMotion(startX);
    const { damage, idle, run } = character.gameplay;
    const initial = damage[0] ?? idle ?? run[staticRunFrameIndex(run.length)];
    this.sprite = scene.add
      .sprite(startX, BOSS_ARENA.floorY, initial.key)
      .setOrigin(0.5, 1)
      .setScale(resolveGameplayScale(character, damage[0] ? 'damage' : idle ? 'idle' : 'run'))
      .setDepth(BossDepth.PLAYER);
  }

  get x(): number {
    return this.motion.x;
  }

  startEntrance(nowMs: number): void {
    this.entranceStartedAtMs = nowMs;
  }

  isEntranceComplete(nowMs: number): boolean {
    return this.entranceStartedAtMs !== undefined
      && nowMs - this.entranceStartedAtMs >= ENTRANCE_FALL_DURATION_MS;
  }

  /** Plays the damage pose, knocks the player away from the beam and blinks. */
  onHit(nowMs: number, beamCenterX: number): void {
    this.motion = applyKnockback(this.motion, nowMs, beamCenterX);
    this.damageFrameUntilMs = nowMs + BOSS_PLAYER.knockbackDurationMs;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAlpha(1);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: { from: 1, to: 0.35 },
      duration: 120,
      yoyo: true,
      repeat: Math.floor(BOSS_PLAYER.invulnerabilityMs / 240),
      onComplete: () => this.sprite.setAlpha(1),
    });
  }

  update(deltaMs: number, direction: MoveDirection, nowMs: number, bounds: ArenaBounds): void {
    this.motion = stepBossPlayer(this.motion, deltaMs, direction, nowMs, bounds);
    const resolved = this.resolveFrame(nowMs, direction);
    const { frame } = resolved;
    this.currentPose = resolved.pose;
    if (frame.key !== this.currentFrameKey) {
      this.sprite.setTexture(frame.key);
      this.currentFrameKey = frame.key;
    }
    const scale = this.resolveScale(this.currentPose);
    // The authored presentation offset rides on top of wherever the fight put
    // the character; `motion` itself is never touched, so dodging, collision
    // and the arena bounds are exactly as before.
    const anchor = this.anchorAt(nowMs, frame.footGap);
    this.sprite.x = anchor.x + this.presentation.offsetX;
    this.sprite.y = anchor.y + this.presentation.offsetY;
    this.sprite.setScale(scale * this.presentation.scale);
    // Face the way the player is travelling; the run art is drawn facing right.
    if (this.motion.velocityX !== 0) {
      this.sprite.setFlipX(this.motion.velocityX < 0);
    }
  }

  /** Where the fight wants the character drawn, before any authored offset. */
  anchorAt(nowMs: number, footGap: number): { x: number; y: number } {
    return {
      x: this.motion.x,
      y:
        BOSS_ARENA.floorY
        + footOffset(footGap, this.resolveScale(this.currentPose))
        + this.entranceOffsetY(nowMs),
    };
  }

  /** The sprite the dev editor selects. Presentation only; never physics. */
  get displayObject(): Phaser.GameObjects.Sprite {
    return this.sprite;
  }

  baseScaleAt(nowMs: number): number {
    void nowMs;
    return this.resolveScale(this.currentPose);
  }

  currentFootGap(nowMs: number, direction: MoveDirection = 0): number {
    return this.resolveFrame(nowMs, direction).frame.footGap;
  }

  /** Applies the authored visual offset/scale; re-read on every update. */
  setPresentation(presentation: { offsetX: number; offsetY: number; scale: number }): void {
    this.presentation = presentation;
  }

  private resolveScale(pose: BossPlayerPose): number {
    return resolveGameplayScale(this.character, pose);
  }

  private resolveFrame(
    nowMs: number,
    direction: MoveDirection,
  ): { frame: CharacterAssetRef; pose: BossPlayerPose } {
    const { idle, run, damage } = this.character.gameplay;
    if (!this.isEntranceComplete(nowMs) && this.entranceStartedAtMs !== undefined && damage.length > 0) {
      return { frame: damage[0], pose: 'damage' };
    }
    if (nowMs < this.damageFrameUntilMs && damage.length > 0) {
      return { frame: damage[0], pose: 'damage' };
    }
    if (direction === 0 && this.motion.velocityX === 0 && idle) {
      return { frame: idle, pose: 'idle' };
    }
    return {
      frame: run[loopedFrameIndex(nowMs, run.length, RUN_CYCLE_MS)],
      pose: 'run',
    };
  }

  private entranceOffsetY(nowMs: number): number {
    if (this.entranceStartedAtMs === undefined) return 0;
    const progress = Phaser.Math.Clamp(
      (nowMs - this.entranceStartedAtMs) / ENTRANCE_FALL_DURATION_MS,
      0,
      1,
    );
    return Phaser.Math.Linear(
      ENTRANCE_FALL_START_OFFSET_Y,
      0,
      Phaser.Math.Easing.Bounce.Out(progress),
    );
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
