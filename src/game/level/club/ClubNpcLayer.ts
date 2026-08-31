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
  /** Suffix counter, so a duplicated group never collides with an existing id. */
  private cloneCount = 0;

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
    return this.instances.map((instance) => this.toEditableObject(instance));
  }

  /**
   * A crowd group is one of the things duplicating genuinely makes sense for:
   * a room is populated by placing the same handful of groups repeatedly, so
   * copy/paste beats hand-writing another placement entry. Declaring `clone`
   * is the whole opt-in — the shared editor core offers copy/paste for
   * exactly the objects that have it, and nothing else in the game's scenes
   * (the single Level 4 backdrop, the main player) does.
   */
  private toEditableObject(instance: NpcInstance): EditableObject {
    return {
      id: instance.id,
      target: instance.sprite,
      label: instance.placement.group,
      getNativeSize: () => ({
        width: instance.sprite.width,
        height: instance.sprite.height,
      }),
      clone: () => {
        const created = this.duplicate(instance);
        return created ? this.toEditableObject(created) : undefined;
      },
      // Deleting an ambient group is as meaningful as duplicating one: a room
      // is tuned by adding and removing crowd, and `buildLayoutFromSnapshot`
      // maps over `instances`, so dropping it here is also what omits it from
      // the next save and keeps it gone after a reload. Only these NPCs
      // declare it — the player, the room video and every other singleton
      // have no `remove`, so the editor cannot delete them.
      remove: () => this.removeInstance(instance),
    };
  }

  /** Destroys one crowd group and stops tracking it. */
  private removeInstance(instance: NpcInstance): void {
    const index = this.instances.indexOf(instance);
    if (index < 0) return;
    this.instances.splice(index, 1);
    instance.sprite.destroy();
  }

  /**
   * Builds a live copy of one group's sprite and starts tracking it, so the
   * duplicate animates, lays out and is saved exactly like an authored one.
   */
  private duplicate(instance: NpcInstance): NpcInstance | undefined {
    const first = instance.art.frames[0];
    if (!first || !this.scene.textures.exists(first.key)) return undefined;
    this.cloneCount += 1;
    const sprite = this.scene.add
      .sprite(instance.sprite.x, instance.sprite.y, instance.currentKey ?? first.key)
      .setOrigin(0.5, 1)
      .setDepth(this.depth)
      .setScale(instance.sprite.scaleX, instance.sprite.scaleY)
      .setFlipX(instance.sprite.flipX);
    // Offset the animation phase rather than copying it: two groups of the
    // same art sharing a phase animate frame-for-frame in lockstep, which
    // reads as one mirrored sprite instead of two separate knots of people.
    // The editor has no way to set a phase by hand — it only drags and
    // resizes — so the duplicate has to arrive with one of its own.
    const cycleMs = instance.placement.cycleMs ?? NPC_IDLE_CYCLE_MS;
    const copy: NpcInstance = {
      id: `${instance.id}:copy:${this.cloneCount}`,
      placement: {
        ...instance.placement,
        phaseMs: Math.round(((instance.placement.phaseMs ?? 0) + cycleMs / 3) % cycleMs),
      },
      art: instance.art,
      sprite,
      currentKey: instance.currentKey,
    };
    this.instances.push(copy);
    return copy;
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
