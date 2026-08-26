import Phaser from 'phaser';
import { Depth, GROUND_Y, DESIGN_HEIGHT } from '../constants';
import {
  queueCharacterGameplay,
} from '../characters/characterAssets';
import {
  footOffset,
  loopedFrameIndex,
  RUN_CYCLE_MS,
} from '../characters/characterAnimation';
import type { CharacterAssetRef, CharacterDefinition } from '../characters/characterManifest';
import { getSelectedCharacter } from '../characters/characterSelection';
import {
  CLUB_ROOMS,
  resolveClubRoomTransition,
  type ClubRoomEdge,
} from '../level/club/clubRooms';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { prefetchVideo, releasePrefetchedVideo } from '../systems/videoPrefetch';
import { OrientationController } from '../responsive/OrientationController';
import type { ViewportInfo } from '../responsive/ViewportInfo';
import type { LevelCompleteSceneData } from './LevelCompleteScene';

export interface ClubSceneData {
  /** Running total carried in from Berlin; Level 2 does not change it. */
  score?: number;
}

/**
 * Walking pace in logical pixels per second. This is the knob for how fast
 * the player crosses a room: higher is faster.
 *
 * Kept roughly proportional to CLUB_PLAYER_SCALE — a bigger character covering
 * the same ground per second reads as trudging — so if that changes a lot,
 * this usually wants to move with it.
 */
 const WALK_SPEED = 420;
/**
 * How far inside the edge the player is placed on entering a room, and how
 * close to the edge counts as leaving. Comfortably wider than one step at
 * WALK_SPEED so a transition can never immediately re-trigger backwards.
 */
const EDGE_MARGIN = 46;
const ENTRY_INSET = 96;
/** Matches Player.syncVisual, so the player stands exactly as in Berlin. */
const FOOT_NUDGE = 10;
/**
 * Level 2 only, and applies to whichever character is selected. The club
 * rooms are shot much closer than Berlin's street, so the player is drawn
 * larger here than PLAYER_VISUAL_SCALE's 0.8 to sit in them convincingly.
 * Local on purpose: the shared constant also drives Berlin and the boss
 * fight, where the size is paired with the collision box.
 *
 * Anything reading a per-frame foot gap must be given this same scale — the
 * gaps are in source pixels, so scaling the sprite without scaling them lets
 * the feet drift, and by a different amount per run frame.
 */
const CLUB_PLAYER_SCALE = 1.8;
/**
 * How far below Berlin's ground line the club floor sits, in logical pixels
 * at the 720-high design size. The room videos are framed lower than the
 * street, so the player stands further down the frame here. This is the knob to
 * turn to move him up or down: positive is down.
 */
const FLOOR_DROP = 100;
/** Floor line as a fraction of the logical height, which EXPAND pins at 720. */
const FLOOR_RATIO = (GROUND_Y + FLOOR_DROP) / DESIGN_HEIGHT;

/**
 * Level 2: three club interiors the player walks through, each an looping
 * MP4 behind the selected character.
 *
 * There is no jumping, ducking, obstacle or scoring here — it is a
 * connective walk between Berlin and the DJ set — so the scene runs no
 * physics at all and moves the player by hand.
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
  /**
   * The room's first frame, shown from the instant the room is entered and
   * hidden once the video is actually producing frames. Opening a video is
   * never instantaneous — even fully cached it has to demux and start a
   * decoder, and on mobile it may be waiting on an autoplay gesture — so
   * without this the camera background shows through as a black screen.
   */
  private poster?: Phaser.GameObjects.Image;
  private playerSprite!: Phaser.GameObjects.Sprite;
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
  /**
   * The player's x as a float. The sprite itself is only ever placed on whole
   * pixels: at CLUB_PLAYER_SCALE the art is magnified, and drawing magnified
   * art on a subpixel boundary makes the GPU resample it every frame, which
   * reads as a soft, shimmering edge. Keeping the motion here and rounding at
   * draw time removes that without making the walk step-y.
   */
  private walkX = 0;
  /** Last direction walked; kept when stopping so the player does not snap around. */
  private facing: 1 | -1 = 1;
  private character!: CharacterDefinition;
  private currentFrameKey?: string;
  private transitioning = false;
  private finished = false;

  constructor() {
    super('ClubScene');
  }

  preload(): void {
    // Demand-driven and idempotent: after Berlin has run, this queues
    // nothing, and a direct ?scene=club still loads what it needs.
    this.character = getSelectedCharacter();
    queueCharacterGameplay(this, this.character);
  }

  init(data: ClubSceneData): void {
    this.score = data.score ?? 0;
    this.roomIndex = 0;
    this.walkX = 0;
    this.facing = 1;
    this.currentFrameKey = undefined;
    this.transitioning = false;
    this.finished = false;
    this.leftPointers.clear();
    this.rightPointers.clear();
  }

  create(): void {
    attachFullscreenExitControl(this);
    this.cameras.main.setBackgroundColor('#07040d');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    this.poster = this.add
      .image(0, 0, CLUB_ROOMS[0].posterKey)
      .setOrigin(0.5, 0.5)
      .setDepth(Depth.FAR_BACKGROUND - 1)
      .setVisible(false);

    this.playerSprite = this.add
      .sprite(0, 0, this.character.gameplay.idle!.key)
      .setOrigin(0.5, 1)
      .setScale(CLUB_PLAYER_SCALE)
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
      this.walkX += direction * WALK_SPEED * (delta / 1000);
    }
    this.applyWalkFrame(direction !== 0);
    if (direction !== 0) this.checkEdges(direction);
  }

  private applyWalkFrame(walking: boolean): void {
    // Still the run cycle, exactly as before: the discovered walk frames stay
    // unused until Club's presentation is revisited on purpose.
    const { run, idle } = this.character.gameplay;
    const frame: CharacterAssetRef = walking
      ? run[loopedFrameIndex(this.time.now, run.length, RUN_CYCLE_MS)]
      : idle!;
    if (frame.key !== this.currentFrameKey) {
      this.playerSprite.setTexture(frame.key);
      this.currentFrameKey = frame.key;
    }
    // Right is the artwork's natural facing; left mirrors it.
    this.playerSprite.setFlipX(this.facing === -1);
    this.playerSprite.setPosition(
      Math.round(this.walkX),
      Math.round(this.floorY() + footOffset(frame.footGap, CLUB_PLAYER_SCALE) + FOOT_NUDGE),
    );
  }

  private checkEdges(direction: -1 | 1): void {
    const width = this.cameras.main.width;
    const edge: ClubRoomEdge | undefined =
      direction === 1 && this.walkX >= width - EDGE_MARGIN
        ? 'right'
        : direction === -1 && this.walkX <= EDGE_MARGIN
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
      this.walkX = EDGE_MARGIN;
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
    // Up before the video is even requested, so there is no frame of black.
    if (this.poster && this.textures.exists(room.posterKey)) {
      this.poster.setTexture(room.posterKey).setVisible(true);
      this.layoutPoster();
    }
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
    // Only now is the warmed copy redundant: the real element has its own
    // request and enough data to play. Releasing any earlier could abort an
    // unfinished download that nothing else was fetching yet.
    if (import.meta.env.DEV) this.traceVideoStartup(video, room.videoUrl);
    video.once(Phaser.GameObjects.Events.VIDEO_PLAYING, () => {
      releasePrefetchedVideo(room.videoUrl);
      // Only now is the video definitely drawing; until then the still is
      // what the player sees, including while an autoplay block waits for a
      // gesture.
      this.poster?.setVisible(false);
    });
    this.video = video;
    this.layoutVideo();

    const width = this.cameras.main.width;
    this.walkX = enterFrom === 'left' ? ENTRY_INSET : width - ENTRY_INSET;
    this.applyWalkFrame(false);

    this.prefetchNeighbour(roomIndex + 1);
  }

  /**
   * Warms the next room so its transition is quick. Deduplicated by the
   * helper, so walking back and forth re-requests nothing, and an in-flight
   * download is never aborted just because the player changed direction —
   * which the previous scene-local version did on every room change.
   */
  private prefetchNeighbour(roomIndex: number): void {
    const room = CLUB_ROOMS[roomIndex];
    if (room) prefetchVideo(room.videoUrl);
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
   * Dev-only: reports how long each stage of opening a room video takes, and
   * whether the browser blocked autoplay. `locked` means the still stays up
   * until the player touches the screen, which looks the same as a slow load
   * but is not one.
   */
  private traceVideoStartup(video: Phaser.GameObjects.Video, url: string): void {
    const started = performance.now();
    const since = (): string => `${Math.round(performance.now() - started)}ms`;
    const element = video.video as HTMLVideoElement | null | undefined;
    console.debug(`[ClubScene] opening ${url} (readyState ${element?.readyState ?? '-'})`);
    for (const event of ['metadata', 'created', 'playing', 'locked', 'unlocked', 'error'] as const) {
      video.once(event, () => console.debug(`[ClubScene] ${url} ${event} +${since()}`));
    }
  }

  /**
   * Places a room background: cover the viewport with one uniform scale, then
   * push it down by that room's own `videoShiftY`.
   *
   * Both knobs come from the room config rather than from conditionals here,
   * so a room with neither set gets exactly the plain centred cover fit —
   * shift 0 and overscan 1 leave the maths below an identity.
   *
   * Where a shift is set, the overscan used is whichever is larger of the
   * room's own floor and what the shift actually needs. Pushing down only
   * risks the *top* edge, and keeping it covered needs
   * `displayHeight >= cameraHeight + 2 * shift`; deriving that from the live
   * viewport rather than trusting the constant means the shift is always
   * applied in full instead of being quietly clamped, and either value can be
   * tuned on its own without opening a gap.
   */
  private layoutRoomArt(
    target: Phaser.GameObjects.Image | Phaser.GameObjects.Video,
    naturalWidth: number,
    naturalHeight: number,
  ): void {
    const room = CLUB_ROOMS[this.roomIndex];
    const shiftY = room?.videoShiftY ?? 0;
    const overscanFloor = room?.videoOverscan ?? 1;
    const camera = this.cameras.main;
    const cover = Math.max(camera.width / naturalWidth, camera.height / naturalHeight);
    const required = (camera.height + 2 * shiftY) / (naturalHeight * cover);
    const scale = cover * Math.max(overscanFloor, required);
    target.setDisplaySize(naturalWidth * scale, naturalHeight * scale);
    target.setPosition(camera.width / 2, camera.height / 2 + shiftY);
  }

  private layoutPoster(): void {
    const poster = this.poster;
    if (!poster || poster.width <= 0 || poster.height <= 0) return;
    // The still shares the video's placement exactly, so the handover when
    // the video starts is invisible.
    this.layoutRoomArt(poster, poster.width, poster.height);
  }

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
    this.layoutRoomArt(video, naturalWidth, naturalHeight);
    video.setVisible(true);
  }

  private applyResponsiveLayout(viewport?: ViewportInfo): void {
    const camera = this.cameras.main;
    this.layoutVideo();
    this.layoutPoster();

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
    this.walkX = Phaser.Math.Clamp(this.walkX, EDGE_MARGIN, camera.width - EDGE_MARGIN);
    this.applyWalkFrame(false);
  }

  private cleanup(): void {
    this.releaseVideo();
    // Leaving Level 2: every room file is done with, and a retry re-warms
    // from the HTTP cache rather than the network.
    for (const room of CLUB_ROOMS) releasePrefetchedVideo(room.videoUrl);
    this.tweens.killAll();
    this.leftPointers.clear();
    this.rightPointers.clear();
  }
}
