import type Phaser from 'phaser';
import { footOffset, loopedFrameIndex } from '../../characters/characterAnimation';
import type { EditableObject } from '../../systems/SceneEditor';
import { getClubNpcGroup, type ClubNpcGroupArt } from './clubNpcAssets';
import {
  getRoomNpcPlacements,
  NPC_IDLE_CYCLE_MS,
  resolveClubNpcTransform,
  toClubNpcPlacement,
  type ClubNpcPlacement,
} from './clubNpcPlacement';

interface NpcInstance {
  /** Stable within a room; also the SceneEditor id. */
  id: string;
  placement: ClubNpcPlacement;
  art: ClubNpcGroupArt;
  sprite: Phaser.GameObjects.Sprite;
  /** Last texture key pushed, so `update` only calls setTexture on a real change. */
  currentKey?: string;
}

/**
 * The ambient crowd in one club room.
 *
 * Scenery only: nothing here is interactive, has a body, or is consulted by
 * ClubScene's walking, edge or completion logic. The sprites sit above the
 * room video and below the player, so the player walks in front of them.
 *
 * Animation reuses the game's existing looping mechanism rather than Phaser
 * animations or a second NPC system: `loopedFrameIndex` picks a frame from
 * wall-clock time per *cycle*, which is how the player's own run cycle and
 * the dialogue portraits already work, and `footOffset` seats each group on
 * its floor line using the same scaled foot-gap convention as player art.
 * Frames therefore advance from the scene clock, which means the global pause
 * system freezes the crowd along with everything else for free.
 *
 * Placement comes entirely from `clubNpcPlacement`; this class holds no
 * positions of its own.
 */
export class ClubNpcLayer {
  private instances: NpcInstance[] = [];
  private roomId = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
    /** Floor line used by placements that don't override it; the player's own. */
    private readonly fallbackBaselineRatio: number,
  ) {}

  /**
   * Rebuilds the crowd for `roomId`. Every previous sprite is destroyed
   * first, so walking back and forth never leaves the last room's crowd
   * behind. Placements whose artwork has not finished loading are skipped
   * rather than drawn as a missing-texture box; `ClubScene` calls this again
   * once the load completes.
   */
  setRoom(roomId: string): void {
    this.clear();
    this.roomId = roomId;

    getRoomNpcPlacements(roomId).forEach((placement, index) => {
      const art = getClubNpcGroup(placement.group);
      const first = art.frames[0];
      if (!first || !this.scene.textures.exists(first.key)) return;

      const sprite = this.scene.add
        .sprite(0, 0, first.key)
        // Bottom origin: the sprite's y is its floor line, before the
        // group's own foot gap is added back on.
        .setOrigin(0.5, 1)
        .setDepth(this.depth)
        .setFlipX(placement.flipX === true);

      this.instances.push({
        // Index-qualified so a room showing the same group twice stays addressable.
        id: `${roomId}:${index}:${placement.group}`,
        placement,
        art,
        sprite,
        currentKey: first.key,
      });
    });

    this.layout();
  }

  /** True once every placement in the current room has a sprite. */
  isComplete(): boolean {
    return this.instances.length === getRoomNpcPlacements(this.roomId).length;
  }

  /**
   * Advances every group to the frame its own loop is on at `now`.
   *
   * Cheap enough to run every frame: it is a modulo per group and a
   * `setTexture` only when the frame actually changes.
   */
  update(now: number): void {
    for (const instance of this.instances) {
      const { frames } = instance.art;
      if (frames.length === 0) continue;
      const cycleMs = instance.placement.cycleMs ?? NPC_IDLE_CYCLE_MS;
      const phaseMs = instance.placement.phaseMs ?? 0;
      const frame = frames[loopedFrameIndex(now + phaseMs, frames.length, cycleMs)];
      if (frame.key === instance.currentKey) continue;
      instance.sprite.setTexture(frame.key);
      instance.currentKey = frame.key;
    }
  }

  /** Re-places every group for the current viewport; call on any resize. */
  layout(): void {
    const camera = this.scene.cameras.main;
    for (const instance of this.instances) {
      this.applyTransform(instance, camera.width, camera.height);
    }
  }

  private applyTransform(instance: NpcInstance, cameraWidth: number, cameraHeight: number): void {
    const transform = resolveClubNpcTransform(
      instance.placement,
      cameraWidth,
      cameraHeight,
      this.fallbackBaselineRatio,
    );
    instance.sprite.setScale(transform.scale);
    // Pushing down by the scaled foot gap is what puts the drawn feet on the
    // floor line rather than the bottom of a largely empty canvas.
    instance.sprite.setPosition(
      Math.round(transform.x),
      Math.round(transform.y + footOffset(instance.art.footGap, transform.scale)),
    );
  }

  // ------------------------------------------------------------ dev editor

  /**
   * Registers each group with the generic SceneEditor, so positions can be
   * dragged and resized in place and saved back to `clubNpcPlacement.json`
   * instead of being tuned by editing numbers blind.
   */
  getEditableObjects(): EditableObject[] {
    return this.instances.map((instance) => ({
      id: instance.id,
      target: instance.sprite,
      label: instance.placement.group,
      getNativeSize: () => ({
        width: instance.sprite.width,
        height: instance.sprite.height,
      }),
    }));
  }

  /**
   * Turns an editor snapshot back into placement config for the current room.
   *
   * The editor works in absolute pixels against the sprite's own origin, so
   * the y it reports is already the floor line and the foot gap has to come
   * back out before it is stored — otherwise every save would push the group
   * one foot gap further down than where it was left.
   */
  buildLayoutFromSnapshot(
    snapshot: readonly { id: string; x: number; y: number; scaleX: number; scaleY: number }[],
  ): ClubNpcPlacement[] {
    const camera = this.scene.cameras.main;
    const byId = new Map(snapshot.map((entry) => [entry.id, entry]));
    return this.instances.map((instance) => {
      const entry = byId.get(instance.id);
      if (!entry) return instance.placement;
      return toClubNpcPlacement(
        instance.placement,
        {
          x: entry.x,
          y: entry.y - footOffset(instance.art.footGap, entry.scaleY),
          scale: entry.scaleY,
        },
        camera.width,
        camera.height,
      );
    });
  }

  /** Room id the current instances belong to; the key to save them under. */
  getRoomId(): string {
    return this.roomId;
  }

  clear(): void {
    for (const instance of this.instances) instance.sprite.destroy();
    this.instances = [];
  }

  destroy(): void {
    this.clear();
  }
}
