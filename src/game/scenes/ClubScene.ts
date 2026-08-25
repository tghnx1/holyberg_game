import Phaser from 'phaser';
import { Depth, GROUND_Y, DESIGN_HEIGHT } from '../constants';
import {
  ATMOS_RUN_FRAME_DURATION_MS,
  ATMOS_RUN_FRAME_KEYS,
  ATMOS_STAY_FRAME_KEY,
  getAtmosFootOffset,
  getLoopedFrame,
  type AtmosFrameKey,
} from '../entities/atmosFrames';
import {
  CLUB_ROOMS,
  resolveClubRoomTransition,
  type ClubRoomEdge,
} from '../level/club/clubRooms';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import type { ViewportInfo } from '../responsive/ViewportInfo';
import type { LevelCompleteSceneData } from './LevelCompleteScene';

export interface ClubSceneData {
  /** Running total carried in from Berlin; Level 2 does not change it. */
  score?: number;
}

/** Walking pace. Slower than Berlin's auto-run: this is a stroll, not a chase. */
const WALK_SPEED = 210;
/**
 * How far inside the edge the player is placed on entering a room, and how
 * close to the edge counts as leaving. Comfortably wider than one step at
 * WALK_SPEED so a transition can never immediately re-trigger backwards.
 */
const EDGE_MARGIN = 46;
const ENTRY_INSET = 96;
/** Matches Player.syncVisual, so Atmos stands exactly as he does in Berlin. */
const FOOT_NUDGE = 10;
/**
 * Level 2 only. The club rooms are shot much closer than Berlin's street, so
 * Atmos is drawn larger here than ATMOS_VISUAL_SCALE's 0.8 to sit in them
 * convincingly. Local on purpose: the shared constant also drives Berlin and
 * the boss fight, where the size is tied to the collision box.
 *
 * Anything reading a per-frame foot gap must be given this same scale — the
 * gaps are in source pixels, so scaling the sprite without scaling them lets
 * the feet drift, and by a different amount per run frame.
 */
const ATMOS_CLUB_SCALE = 1.2;
/**
 * How far below Berlin's ground line the club floor sits, in logical pixels
 * at the 720-high design size. The room videos are framed lower than the
 * street, so Atmos stands further down the frame here. This is the knob to
 * turn to move him up or down: positive is down.
 */
const FLOOR_DROP = 30;
/** Floor line as a fraction of the logical height, which EXPAND pins at 720. */
const FLOOR_RATIO = (GROUND_Y + FLOOR_DROP) / DESIGN_HEIGHT;

/**
 * Level 2: three club interiors the player walks through, each an looping
 * MP4 behind Atmos.
 *
 * There is no jumping, ducking, obstacle or scoring here — it is a
 * connective walk between Berlin and the DJ set — so the scene runs no
 * physics at all and moves Atmos by hand.
 *
 * Only one room's video is ever alive: switching rooms stops and destroys
 * the outgoing one before the next is created, so at most one decoder is
 * running. The next room's file is warmed separately through a detached,
 * never-played element (see `prefetchNeighbour`), which fills the HTTP cache
 * without giving the browser a second video to decode.
 */
export class ClubScene extends Phaser.Scene {
  private score = 0;
  private roomIndex = 0;
  private video?: Phaser.GameObjects.Video;
  /** Detached element used only to pull the next room into the HTTP cache. */
  private prefetch?: HTMLVideoElement;
  private prefetchedUrl?: string;
  private atmos!: Phaser.GameObjects.Sprite;
  private roomLabel!: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private leftZone?: Phaser.GameObjects.Zone;
  private rightZone?: Phaser.GameObjects.Zone;
  /** Pointer ids currently held on each walk zone, so multi-touch releases cleanly. */
  private readonly leftPointers = new Set<number>();
  private readonly rightPointers = new Set<number>();
  /** Last direction walked; kept when stopping so Atmos does not snap around. */
  private facing: 1 | -1 = 1;
  private currentFrameKey: AtmosFrameKey = ATMOS_STAY_FRAME_KEY;
  private transitioning = false;
  private finished = false;

  constructor() {
    super('ClubScene');
  }

  init(data: ClubSceneData): void {
    this.score = data.score ?? 0;
    this.roomIndex = 0;
    this.facing = 1;
    this.currentFrameKey = ATMOS_STAY_FRAME_KEY;
    this.transitioning = false;
    this.finished = false;
    this.leftPointers.clear();
    this.rightPointers.clear();
  }

  create(): void {
    attachFullscreenExitControl(this);
    this.cameras.main.setBackgroundColor('#07040d');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    this.atmos = this.add
      .sprite(0, 0, ATMOS_STAY_FRAME_KEY)
      .setOrigin(0.5, 1)
      .setScale(ATMOS_CLUB_SCALE)
      .setDepth(Depth.PLAYER);

    this.roomLabel = this.add
      .text(0, 0, '', {
        fontFamily: 'Space Mono',
        fontSize: '15px',
        color: '#c9b6e4',
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(Depth.UI);

    this.buildControls();
    this.enterRoom(this.roomIndex, 'left');

    new OrientationController(this, {
      onLayout: (viewport) => this.applyResponsiveLayout(viewport),
    });
    this.applyResponsiveLayout();
  }

  // ---------------------------------------------------------------- input

  private buildControls(): void {
    const keyboard = this.input.keyboard;
    this.cursors = keyboard?.createCursorKeys();
    this.keyA = keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    if (!this.game.device.input.touch) return;

    // Below Depth.UI so the fullscreen exit control still wins the pointer.
    const zoneDepth = Depth.UI - 5;
    this.leftZone = this.add.zone(0, 0, 1, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(zoneDepth);
    this.rightZone = this.add.zone(0, 0, 1, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(zoneDepth);
    this.leftZone.setInteractive();
    this.rightZone.setInteractive();

    const hold = (set: Set<number>) => (pointer: Phaser.Input.Pointer) => {
      pointer.event?.preventDefault();
      set.add(pointer.id);
      this.fadeHint();
    };
    this.leftZone.on('pointerdown', hold(this.leftPointers));
    this.rightZone.on('pointerdown', hold(this.rightPointers));

    // Released anywhere, including off the zone or off the canvas entirely.
    const release = (pointer: Phaser.Input.Pointer): void => {
      this.leftPointers.delete(pointer.id);
      this.rightPointers.delete(pointer.id);
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      this.leftPointers.clear();
      this.rightPointers.clear();
    });

    this.hint = this.add
      .text(0, 0, 'HOLD LEFT / RIGHT TO WALK', {
        fontFamily: 'Space Mono',
        fontSize: '15px',
        color: '#ffdf57',
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.85)
      .setScrollFactor(0)
      .setDepth(Depth.UI);
  }

  private fadeHint(): void {
    const hint = this.hint;
    if (!hint || hint.alpha === 0) return;
    this.tweens.add({ targets: hint, alpha: 0, duration: 400 });
  }

  /** -1 walking left, 1 walking right, 0 standing still. */
  private readDirection(): -1 | 0 | 1 {
    const left =
      this.cursors?.left.isDown === true ||
      this.keyA?.isDown === true ||
      this.leftPointers.size > 0;
    const right =
      this.cursors?.right.isDown === true ||
      this.keyD?.isDown === true ||
      this.rightPointers.size > 0;
    if (left === right) return 0;
    return left ? -1 : 1;
  }

  // ----------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    if (this.finished) return;
    const direction = this.transitioning ? 0 : this.readDirection();
    if (direction !== 0) {
      this.facing = direction;
      this.atmos.x += direction * WALK_SPEED * (delta / 1000);
    }
    this.applyWalkFrame(direction !== 0);
    if (direction !== 0) this.checkEdges(direction);
  }

  private applyWalkFrame(walking: boolean): void {
    const frameKey: AtmosFrameKey = walking
      ? getLoopedFrame(ATMOS_RUN_FRAME_KEYS, this.time.now, ATMOS_RUN_FRAME_DURATION_MS)
      : ATMOS_STAY_FRAME_KEY;
    if (frameKey !== this.currentFrameKey) {
      this.atmos.setTexture(frameKey);
      this.currentFrameKey = frameKey;
    }
    // Right is the artwork's natural facing; left mirrors it.
    this.atmos.setFlipX(this.facing === -1);
    this.atmos.y = this.floorY() + getAtmosFootOffset(frameKey, ATMOS_CLUB_SCALE) + FOOT_NUDGE;
  }

  private checkEdges(direction: -1 | 1): void {
    const width = this.cameras.main.width;
    const edge: ClubRoomEdge | undefined =
      direction === 1 && this.atmos.x >= width - EDGE_MARGIN
        ? 'right'
        : direction === -1 && this.atmos.x <= EDGE_MARGIN
          ? 'left'
          : undefined;
    if (!edge) return;

    const transition = resolveClubRoomTransition(this.roomIndex, edge);
    if (transition.completesLevel) {
      this.complete();
      return;
    }
    if (transition.roomIndex === undefined || transition.enterFrom === undefined) {
      // A wall: the first room's left edge. Hold the player just inside it.
      this.atmos.x = EDGE_MARGIN;
      return;
    }
    this.enterRoom(transition.roomIndex, transition.enterFrom);
  }

  // ---------------------------------------------------------------- rooms

  private enterRoom(roomIndex: number, enterFrom: ClubRoomEdge): void {
    this.roomIndex = roomIndex;
    const room = CLUB_ROOMS[roomIndex];
    this.roomLabel.setText(room.label);

    this.releaseVideo();
    // noAudio: true is what makes Phaser set muted + playsinline on the
    // element, which is the combination mobile Safari requires before it will
    // autoplay anything without a gesture.
    const video = this.add
      .video(0, 0)
      .setOrigin(0.5, 0.5)
      .setDepth(Depth.FAR_BACKGROUND)
      // A Video is 256x256 until its first frame arrives; layoutVideo keeps
      // it hidden until the element reports real dimensions.
      .setVisible(false);
    // `noAudio: true` is what sets muted + defaultMuted + autoplay on the
    // element alongside the playsinline Phaser always applies — the exact
    // combination mobile Safari requires to start without a gesture. If the
    // browser still blocks it, Phaser emits VIDEO_LOCKED and retries on the
    // first input, so the walk zones double as the unlock gesture.
    video.loadURL(room.videoUrl, true);
    video.setMute(true);
    video.play(true);
    // The natural size only lands once metadata is in, so refit on each of
    // these rather than assuming it is known now.
    video.on(Phaser.GameObjects.Events.VIDEO_METADATA, () => this.layoutVideo());
    video.on(Phaser.GameObjects.Events.VIDEO_CREATED, () => this.layoutVideo());
    video.on(Phaser.GameObjects.Events.VIDEO_PLAYING, () => this.layoutVideo());
    this.video = video;
    this.layoutVideo();

    const width = this.cameras.main.width;
    this.atmos.x = enterFrom === 'left' ? ENTRY_INSET : width - ENTRY_INSET;
    this.applyWalkFrame(false);

    this.prefetchNeighbour(roomIndex + 1);
  }

  /**
   * Pulls the next room's file into the HTTP cache with a detached element
   * that is never added to the display list and never played, so the
   * transition is quick without a second video decoding alongside the live
   * one. Best-effort: if the browser ignores the hint, the room still works.
   */
  private prefetchNeighbour(roomIndex: number): void {
    const room = CLUB_ROOMS[roomIndex];
    if (!room || this.prefetchedUrl === room.videoUrl) return;
    this.releasePrefetch();
    const element = document.createElement('video');
    element.muted = true;
    element.setAttribute('playsinline', 'playsinline');
    element.preload = 'auto';
    element.src = room.videoUrl;
    element.load();
    this.prefetch = element;
    this.prefetchedUrl = room.videoUrl;
  }

  private releasePrefetch(): void {
    const element = this.prefetch;
    if (!element) return;
    element.removeAttribute('src');
    element.load();
    this.prefetch = undefined;
    this.prefetchedUrl = undefined;
  }

  /** Stops playback and frees the decoder before the next room takes over. */
  private releaseVideo(): void {
    const video = this.video;
    if (!video) return;
    this.video = undefined;
    video.removeAllListeners();
    video.stop();
    video.destroy();
  }

  private complete(): void {
    if (this.finished) return;
    this.finished = true;
    this.releaseVideo();
    this.scene.start('LevelCompleteScene', {
      // Level 2 is a walk: it awards nothing and simply carries the running
      // total through to Level 3.
      score: this.score,
      maxScore: this.score,
      retryScene: 'ClubScene',
      retryData: { score: this.score },
      continueScene: 'RhythmScene',
      continueData: { score: this.score },
    } satisfies LevelCompleteSceneData);
  }

  // ----------------------------------------------------------- responsive

  private floorY(): number {
    return this.cameras.main.height * FLOOR_RATIO;
  }

  /**
   * Covers the viewport with the video without distorting it: one uniform
   * scale, so whichever axis overflows is cropped rather than squashed.
   */
  private layoutVideo(): void {
    const video = this.video;
    if (!video) return;
    // Read the element rather than the Game Object: videoWidth/Height are 0
    // until metadata loads, whereas the Game Object reports a 256x256
    // placeholder that is indistinguishable from a real size.
    const element = video.video as HTMLVideoElement | null | undefined;
    const naturalWidth = element?.videoWidth ?? 0;
    const naturalHeight = element?.videoHeight ?? 0;
    if (naturalWidth <= 0 || naturalHeight <= 0) {
      video.setVisible(false);
      return;
    }
    const camera = this.cameras.main;
    // One uniform scale, so the overflowing axis is cropped, never squashed.
    const scale = Math.max(camera.width / naturalWidth, camera.height / naturalHeight);
    video.setDisplaySize(naturalWidth * scale, naturalHeight * scale);
    video.setPosition(camera.width / 2, camera.height / 2);
    video.setVisible(true);
  }

  private applyResponsiveLayout(viewport?: ViewportInfo): void {
    const camera = this.cameras.main;
    this.layoutVideo();

    const margin = viewport?.safeMargin ?? 24;
    this.roomLabel.setPosition(margin, margin).setScale(viewport?.hudScale ?? 1);
    this.hint?.setPosition(camera.width / 2, camera.height - margin).setScale(viewport?.hudScale ?? 1);

    if (this.leftZone && this.rightZone) {
      // Zone.setSize resizes the input hit area with it by default.
      const half = camera.width / 2;
      this.leftZone.setPosition(0, 0).setSize(half, camera.height);
      this.rightZone.setPosition(half, 0).setSize(half, camera.height);
    }

    // Keep the player inside the new width, and on the floor line.
    this.atmos.x = Phaser.Math.Clamp(this.atmos.x, EDGE_MARGIN, camera.width - EDGE_MARGIN);
    this.applyWalkFrame(false);
  }

  private cleanup(): void {
    this.releaseVideo();
    this.releasePrefetch();
    this.tweens.killAll();
    this.leftPointers.clear();
    this.rightPointers.clear();
  }
}
