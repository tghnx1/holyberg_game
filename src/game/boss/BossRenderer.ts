import Phaser from 'phaser';
import {
  BOSS_ART,
  BOSS_VISUAL,
  getBossSpawnFrame,
  loopedBossFrameIndex,
  resolveBossFacing,
  type BossFacing,
} from './bossAssets';
import { BOSS_ARENA } from './bossConfig';
import { BossDepth } from './bossConstants';

type EntranceState = 'buried' | 'spawning' | 'active';

/**
 * The boss's visual, and nothing else.
 *
 * Fight timing, attack scheduling and collision remain entirely outside this
 * class. The authored baby and energy frames share one transparent canvas, so
 * the sphere can be parented to the boss at (0, 0) and stay registered between
 * its hands through every animation frame.
 */
export class BossRenderer {
  private readonly root: Phaser.GameObjects.Container;
  private readonly phaseAura: Phaser.GameObjects.Arc;
  private readonly baby: Phaser.GameObjects.Sprite;
  private readonly energySphere: Phaser.GameObjects.Sprite;
  private presentation = { offsetX: 0, offsetY: 0, scale: 1 };
  private entranceState: EntranceState = 'buried';
  private spawnStartedAtMs = 0;
  private facing: BossFacing = 'front';
  private currentBabyKey?: string;
  private currentSphereKey?: string;
  private pulseUntilMs = -Infinity;

  constructor(
    private readonly scene: Phaser.Scene,
    centerX: number,
  ) {
    this.phaseAura = scene.add
      .circle(0, BOSS_VISUAL.spriteOffsetY, 245)
      .setStrokeStyle(8, 0x56ffff, 0.28);
    this.baby = scene.add.sprite(0, BOSS_VISUAL.spriteOffsetY, BOSS_ART.baby.front[0].key);
    this.energySphere = scene.add
      .sprite(0, BOSS_VISUAL.spriteOffsetY, BOSS_ART.energySphere[0].key)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.root = scene.add
      .container(centerX, BOSS_VISUAL.spawnStartY, [
        this.phaseAura,
        this.baby,
        this.energySphere,
      ])
      .setScale(BOSS_VISUAL.scale)
      .setDepth(BossDepth.BOSS)
      .setVisible(false);
  }

  get baseScale(): number {
    return BOSS_VISUAL.scale;
  }

  /** Where the fight wants the boss drawn, before any authored offset. */
  anchorAt(nowMs: number, centerX: number): { x: number; y: number } {
    return { x: centerX, y: BOSS_ARENA.bossCenterY + Math.sin(nowMs / 520) * 9 };
  }

  /** The object the dev editor selects. Presentation only. */
  get displayObject(): Phaser.GameObjects.Container {
    return this.root;
  }

  get spawnComplete(): boolean {
    return this.entranceState === 'active';
  }

  startSpawn(nowMs: number): void {
    if (this.entranceState !== 'buried') return;
    this.entranceState = 'spawning';
    this.spawnStartedAtMs = nowMs;
    this.root.setVisible(true);
  }

  /** Authored visual offset/scale layered on top of the canonical boss size. */
  setPresentation(presentation: { offsetX: number; offsetY: number; scale: number }): void {
    this.presentation = presentation;
  }

  /**
   * Spawn rise, idle orientation and charge are presentation states only. The
   * director continues to own the exact moment a telegraph/attack is active.
   */
  update(nowMs: number, centerX: number, playerX: number, charging = false): void {
    if (this.entranceState === 'buried') return;

    let x = centerX;
    let y: number;
    let rotation = 0;

    if (this.entranceState === 'spawning') {
      const elapsed = Math.max(0, nowMs - this.spawnStartedAtMs);
      const progress = Phaser.Math.Clamp(elapsed / BOSS_VISUAL.spawnDurationMs, 0, 1);
      const eased = Phaser.Math.Easing.Cubic.Out(progress);
      y = Phaser.Math.Linear(BOSS_VISUAL.spawnStartY, BOSS_ARENA.bossCenterY, eased);
      rotation = progress * Math.PI * 2 * BOSS_VISUAL.spawnRotations;
      const spawnFrame = getBossSpawnFrame(elapsed);
      this.showBabyFrame(spawnFrame.facing, spawnFrame.frameIndex);
      this.energySphere.setVisible(false);
      if (progress >= 1) {
        this.entranceState = 'active';
        this.facing = 'front';
        rotation = 0;
      }
    } else {
      const anchor = this.anchorAt(nowMs, centerX);
      x = anchor.x;
      y = anchor.y;
      this.facing = resolveBossFacing(
        playerX,
        centerX + this.presentation.offsetX,
      );
      this.showBabyFrame(
        this.facing,
        loopedBossFrameIndex(nowMs, BOSS_VISUAL.animationCycleMs),
      );
      this.updateEnergySphere(nowMs, charging);
    }

    const pulse = nowMs < this.pulseUntilMs
      ? 1 + 0.06 * ((this.pulseUntilMs - nowMs) / 220)
      : 1;
    this.root.x = x + this.presentation.offsetX;
    this.root.y = y + this.presentation.offsetY;
    this.root.rotation = rotation;
    this.root.setScale(BOSS_VISUAL.scale * this.presentation.scale * pulse);
  }

  /** Flash when an attack goes live, purely cosmetic. */
  pulse(): void {
    this.pulseUntilMs = this.scene.time.now + 220;
  }

  setPhaseTint(color: number): void {
    // Keep the authored sprite colours intact; carry the existing phase cue
    // on the aura that replaced the procedural boss ring.
    this.phaseAura.setStrokeStyle(8, color, 0.34);
  }

  private showBabyFrame(facing: BossFacing, frameIndex: number): void {
    const frame = BOSS_ART.baby[facing][frameIndex];
    if (frame.key === this.currentBabyKey) return;
    this.baby.setTexture(frame.key);
    this.currentBabyKey = frame.key;
  }

  private updateEnergySphere(nowMs: number, charging: boolean): void {
    this.energySphere.setVisible(charging);
    if (!charging) return;
    const frame = BOSS_ART.energySphere[
      loopedBossFrameIndex(nowMs, BOSS_VISUAL.energyCycleMs)
    ];
    if (frame.key !== this.currentSphereKey) {
      this.energySphere.setTexture(frame.key);
      this.currentSphereKey = frame.key;
    }
    this.energySphere.setScale(BOSS_VISUAL.energyScale + Math.sin(nowMs / 80) * 0.035);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
