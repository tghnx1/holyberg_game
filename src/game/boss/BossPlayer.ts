import Phaser from 'phaser';
import {
  damageFrameIndex,
  footOffset,
  loopedFrameIndex,
  RUN_CYCLE_MS,
  staticRunFrameIndex,
} from '../characters/characterAnimation';
import type { CharacterAssetRef, CharacterDefinition } from '../characters/characterManifest';
import { resolveGameplayScale } from '../characters/characterManifest';
import { BOSS_ARENA, BOSS_PLAYER } from './bossConfig';

import { BossDepth } from './bossConstants';
import { BOSS_ART, BOSS_ASH } from './bossAssets';
import {
  applyKnockback,
  createBossPlayerMotion,
  resolvePlayerMotionBounds,
  stepBossPlayer,
  visiblePlayerHalfWidth,
  type BossPlayerMotion,
  type MoveDirection,
} from './bossPlayerMovement';
import { playerPickupBox, type CollectibleBox } from './emeraldField';
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
  /** Alpha-measured gap below the frame currently drawn by the normal player. */
  private currentFrameFootGap: number;
  private presentation = { offsetX: 0, offsetY: 0, scale: 1, flipX: false };
  /** Cached with the presentation; only those two inputs can change it. */
  private visibleHalfWidth = 0;
  private damageFrameUntilMs = -Infinity;
  /** When the current hit reaction started, so damage frames play in order. */
  private damageFrameStartedAtMs = -Infinity;
  private currentPose: BossPlayerPose = 'idle';
  private entranceStartedAtMs?: number;
  private defeated = false;
  private defeatedAtMs = -Infinity;
  /** Separate ash visual: the normal character is hidden once it is active. */
  private ashSprite?: Phaser.GameObjects.Sprite;
  /** Immutable arena floor position captured when the player is defeated. */
  private ashFloorY?: number;

  constructor(
    private readonly scene: Phaser.Scene,
    startX: number,
    private readonly character: CharacterDefinition,
  ) {
    this.motion = createBossPlayerMotion(startX);
    this.visibleHalfWidth = visiblePlayerHalfWidth(character, 1);
    const { damage, idle, run } = character.gameplay;
    const initial = damage[0] ?? idle ?? run[staticRunFrameIndex(run.length)];
    this.currentFrameFootGap = initial.footGap;
    this.sprite = scene.add
      .sprite(startX, BOSS_ARENA.floorY, initial.key)
      .setOrigin(0.5, 1)
      .setScale(resolveGameplayScale(character, damage[0] ? 'damage' : idle ? 'idle' : 'run'))
      .setDepth(BossDepth.PLAYER);
  }

  get x(): number {
    return this.motion.x;
  }

  /**
   * Live damage geometry in world space.
   *
   * The editor-authored presentation may move or scale the visible character
   * without touching locomotion. Damage must follow that visible body rather
   * than the underlying motion anchor, otherwise a visually clear laser can
   * still hit the player's old logical position.
   */
  get damageHitbox(): { centerX: number; halfWidth: number } {
    return {
      centerX: this.sprite.x,
      halfWidth: BOSS_PLAYER.hitHalfWidth * Math.abs(this.presentation.scale),
    };
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
    this.damageFrameStartedAtMs = nowMs;
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

  /**
   * The arena walls the *drawn* character off, not its motion anchor, so the
   * anchor's own limits are derived from the live presentation every frame.
   */
  motionBoundsWithin(arena: ArenaBounds): ArenaBounds {
    return resolvePlayerMotionBounds(arena, this.visibleHalfWidth, this.presentation);
  }

  /**
   * Where the visible player's centre can actually get to, in world pixels.
   *
   * This — not the raw arena — is the band a collectible must sit inside to be
   * reachable, since the drawn character stops short of both walls by its own
   * half-width and rides the authored offset.
   */
  reachableCenterBounds(arena: ArenaBounds): ArenaBounds {
    const motion = this.motionBoundsWithin(arena);
    return {
      minX: motion.minX + this.presentation.offsetX,
      maxX: motion.maxX + this.presentation.offsetX,
    };
  }

  /**
   * The box an emerald is collected with.
   *
   * Its own geometry — see `playerPickupBox`. It used to borrow
   * `visibleHalfWidth`, which is the widest pose the character has because
   * that is what the arena walls have to accommodate; on every character here
   * that is the damage frame, three to four times wider than the standing
   * body, so emeralds were being collected from a visible step away. Only the
   * centre comes from the live sprite, so the box tracks the drawn character
   * including the editor's authored offset and scale.
   */
  get collectibleBox(): CollectibleBox {
    return playerPickupBox(this.character, {
      centerX: this.sprite.x,
      presentationScale: this.presentation.scale,
    });
  }

  update(deltaMs: number, direction: MoveDirection, nowMs: number, arena: ArenaBounds): void {
    if (this.defeated) {
      this.renderDefeated(nowMs);
      return;
    }
    this.motion = stepBossPlayer(
      this.motion,
      deltaMs,
      direction,
      nowMs,
      this.motionBoundsWithin(arena),
    );
    const resolved = this.resolveFrame(nowMs, direction);
    const { frame } = resolved;
    this.currentFrameFootGap = frame.footGap;
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
      this.sprite.setFlipX((this.motion.velocityX < 0) !== this.presentation.flipX);
    }
  }

  /** Replaceable final-death presentation until the authored coal exists. */
  showDefeated(nowMs: number): void {
    this.defeated = true;
    this.defeatedAtMs = nowMs;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAlpha(1);
    const visibleFloorY = this.sprite.y - footOffset(this.currentFrameFootGap, this.sprite.scaleY);
    this.ashFloorY = visibleFloorY;
    const ash = this.ashSprite ?? this.scene.add
      .sprite(this.sprite.x, visibleFloorY + footOffset(BOSS_ASH.footGaps[0], 1), BOSS_ART.ash[0].key)
      .setOrigin(0.5, 1)
      .setDepth(BossDepth.PLAYER);
    this.ashSprite = ash;
    this.sprite.setVisible(false);
    this.renderDefeated(nowMs);
  }

  private renderDefeated(nowMs: number): void {
    const ash = this.ashSprite;
    if (!ash) return;
    const frameIndex = loopedFrameIndex(
      nowMs - this.defeatedAtMs,
      BOSS_ART.ash.length,
      BOSS_ASH.animationCycleMs,
    );
    const frame = BOSS_ART.ash[frameIndex];
    if (ash.texture.key !== frame.key) ash.setTexture(frame.key);
    // All frames share the floor captured at defeat. Their alpha-measured
    // transparent foot gaps differ, but the visible ash never bobs or drifts.
    ash.setY((this.ashFloorY ?? ash.y) + footOffset(BOSS_ASH.footGaps[frameIndex], ash.scaleY));
  }

  get isDefeated(): boolean {
    return this.defeated;
  }

  get defeatedDisplayObject(): Phaser.GameObjects.Sprite | undefined {
    return this.ashSprite;
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
  setPresentation(presentation: { offsetX: number; offsetY: number; scale: number; flipX: boolean }): void {
    this.presentation = presentation;
    this.visibleHalfWidth = visiblePlayerHalfWidth(this.character, presentation.scale);
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
      return {
        frame: damage[damageFrameIndex(nowMs - this.entranceStartedAtMs, damage.length)],
        pose: 'damage',
      };
    }
    if (nowMs < this.damageFrameUntilMs && damage.length > 0) {
      return {
        frame: damage[damageFrameIndex(nowMs - this.damageFrameStartedAtMs, damage.length)],
        pose: 'damage',
      };
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
    this.ashSprite?.destroy();
    this.ashSprite = undefined;
    this.ashFloorY = undefined;
  }
}
