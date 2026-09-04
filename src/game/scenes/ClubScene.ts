import Phaser from 'phaser';
import { Depth, GROUND_Y, DESIGN_HEIGHT } from '../constants';
import { queueCharacterGameplay } from '../characters/characterAssets';
import { footOffset } from '../characters/characterAnimation';
import {
  resolveLocomotionFrame,
  resolveLocomotionPose,
  type LocomotionMotion,
} from '../characters/characterLocomotion';
import {
  resolveGameplayScale,
  type CharacterAssetRef,
  type CharacterDefinition,
} from '../characters/characterManifest';
import { getSelectedCharacter } from '../characters/characterSelection';
import {
  buildClubRoomDialogue,
  characterForClubStorySlot,
  CLUB_STORY_PLACEMENTS,
  clubStorySlotForRoom,
  resolveClubStoryCast,
  type ClubStoryCast,
  type ClubStorySlot,
} from '../level/club/clubStory';
import {
  CLUB_ROOMS,
  resolveClubRoomTransition,
  type ClubRoomEdge,
} from '../level/club/clubRooms';
import { ClubNpcLayer } from '../level/club/ClubNpcLayer';
import { collectClubNpcFrames } from '../level/club/clubNpcAssets';
import { getRoomNpcGroups } from '../level/club/clubNpcPlacement';
import type { EditableObject } from '../systems/SceneEditor';
import type { EditableScene, EditorSavePayload } from '../systems/editableScene';
import { createPlayerEditable, getPlayerVisualOffset } from '../systems/playerPresentation';
import { buildSceneLayoutPayload } from '../systems/sceneLayout';
import { getSceneObjectLayout, setSceneObjectLayout } from '../systems/sceneLayout';
import {
  captureCurrentSceneSnapshot,
  launchCurrentSceneDialogue,
  releaseCurrentSceneSnapshot,
  type CurrentSceneSnapshot,
} from '../dialogue/currentSceneSnapshot';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { prefetchVideo, releasePrefetchedVideo } from '../systems/videoPrefetch';
import { OrientationController } from '../responsive/OrientationController';
import type { ViewportInfo } from '../responsive/ViewportInfo';
import { WalkInput, WALK_SPEED } from '../systems/WalkControls';
import type { LevelCompleteSceneData } from './LevelCompleteScene';

export interface ClubSceneData {
  /** Running total carried in from Berlin; Level 2 does not change it. */
  score?: number;
  storyCast?: ClubStoryCast;
  /** Development route only: starts in one room and opens its story beat. */
  devRoomId?: string;
  devDialogue?: boolean;
}

interface ClubStoryActor {
  slot: ClubStorySlot;
  character: CharacterDefinition;
  sprite: Phaser.GameObjects.Sprite;
  mask?: Phaser.GameObjects.Graphics;
}

const CLUB_DIALOGUE_RESUMED_EVENT = 'club-story-dialogue-complete';
const STORY_TRIGGER_DISTANCE = 84;

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
 * How far below Berlin's ground line the club floor sits, in logical pixels
 * at the 720-high design size. The room videos are framed lower than the
 * street, so the player stands further down the frame here. This is the knob to
 * turn to move him up or down: positive is down.
 */
const FLOOR_DROP = 100;
/** Floor line as a fraction of the logical height, which EXPAND pins at 720. */
const FLOOR_RATIO = (GROUND_Y + FLOOR_DROP) / DESIGN_HEIGHT;

/**
 * Level 2: three club interiors the player walks through, each a looping
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
export class ClubScene extends Phaser.Scene implements EditableScene {
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
  private walk!: WalkInput;
  /**
   * The player's x as a float. The sprite itself is only ever placed on whole
   * pixels so the selected character's art stays crisp when it scales to fit
   * the room. Keeping the motion here and rounding at draw time removes
   * subpixel shimmer without making the walk step-y.
   */
  private walkX = 0;
  /** Last direction walked; kept when stopping so the player does not snap around. */
  private facing: 1 | -1 = 1;
  private character!: CharacterDefinition;
  private currentFrameKey?: string;
  private transitioning = false;
  private finished = false;
  /** Ambient crowd for the current room; scenery only, never consulted by gameplay. */
  private npcs?: ClubNpcLayer;
  private storyCast!: ClubStoryCast;
  private storyActor?: ClubStoryActor;
  private completedStorySlots = new Set<ClubStorySlot>();
  private activeStorySlot?: ClubStorySlot;
  private devRoomId?: string;
  private devDialogue = false;

  constructor() {
    super('ClubScene');
  }

  preload(): void {
    // Demand-driven and idempotent: after Berlin has run, this queues
    // nothing, and a direct ?scene=club still loads what it needs.
    this.character = getSelectedCharacter();
    queueCharacterGameplay(this, this.character);
    for (const slot of ['dj1', 'barkeeper', 'dj3'] as const) {
      queueCharacterGameplay(this, characterForClubStorySlot(this.storyCast, slot));
    }
  }

  init(data: ClubSceneData): void {
    this.score = data.score ?? 0;
    this.storyCast = data.storyCast ?? resolveClubStoryCast();
    this.devRoomId = data.devRoomId;
    this.devDialogue = data.devDialogue === true;
    this.roomIndex = Math.max(0, CLUB_ROOMS.findIndex((room) => room.id === this.devRoomId));
    this.walkX = 0;
    this.facing = 1;
    this.currentFrameKey = undefined;
    this.transitioning = false;
    this.finished = false;
    this.completedStorySlots = new Set();
    this.activeStorySlot = undefined;
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

    // Above the room video and poster, below the player: the crowd is part of
    // the room, and the player walks in front of it. Well below Depth.UI, so
    // it can never cover the HUD.
    this.npcs = new ClubNpcLayer(this, Depth.ENVIRONMENT, FLOOR_RATIO);

    this.playerSprite = this.add
      .sprite(0, 0, this.character.gameplay.idle!.key)
      .setOrigin(0.5, 1)
      .setScale(resolveGameplayScale(this.character, 'idle'))
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
    this.events.on(CLUB_DIALOGUE_RESUMED_EVENT, this.onStoryDialogueComplete, this);
    this.enterRoom(this.roomIndex, 'left');

    new OrientationController(this, {
      onLayout: (viewport) => this.applyResponsiveLayout(viewport),
    });
    this.applyResponsiveLayout();

    if (this.devDialogue) {
      this.time.delayedCall(350, () => {
        const slot = clubStorySlotForRoom(this.roomIndexId());
        if (slot) this.startStoryDialogue(slot);
      });
    }

  }

  // ---------------------------------------------------------------- input

  private buildControls(): void {
    // Below Depth.UI so the fullscreen exit control still wins the pointer.
    this.walk = new WalkInput(this, {
      zoneDepth: Depth.UI - 5,
      onHold: () => this.fadeHint(),
    });

    if (!this.game.device.input.touch) return;

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

  // ----------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    // Ambient only: the crowd keeps looping regardless of what the player is
    // doing, and drives nothing else in the scene.
    this.npcs?.update(this.time.now);
    if (this.finished) return;
    const direction = this.transitioning ? 0 : this.walk.direction;
    if (direction !== 0) {
      this.facing = direction;
      this.walkX += direction * WALK_SPEED * (delta / 1000);
    }
    this.applyWalkFrame(direction !== 0);
    if (direction !== 0) {
      this.checkStoryTrigger();
      if (!this.transitioning) this.checkEdges(direction);
    }
  }

  private applyWalkFrame(walking: boolean): void {
    // Level 2 is a walk between Berlin and the DJ set, so it draws the
    // discovered walk frames through the shared locomotion helper rather than
    // looping the run cycle as it used to.
    const motion: LocomotionMotion = walking ? 'walk' : 'idle';
    const frame: CharacterAssetRef = resolveLocomotionFrame(this.character, motion, this.time.now);
    const baseScale = resolveGameplayScale(
      this.character,
      resolveLocomotionPose(this.character, motion),
    );
    if (frame.key !== this.currentFrameKey) {
      this.playerSprite.setTexture(frame.key);
      this.currentFrameKey = frame.key;
    }
    // Right is the artwork's natural facing; left mirrors it.
    this.playerSprite.setFlipX(this.facing === -1);
    const anchor = this.playerAnchor(frame.footGap, baseScale);
    // Visual only: the saved offset moves the drawn sprite, never `walkX`, so
    // room edges and transitions trigger at exactly the same places.
    const visual = getPlayerVisualOffset(this.scene.key);
    this.playerSprite.setScale(baseScale * visual.scale);
    this.playerSprite.setPosition(
      Math.round(anchor.x + visual.offsetX),
      Math.round(anchor.y + visual.offsetY),
    );
  }

  /** Where gameplay wants the player drawn, before any editor offset. */
  private playerAnchor(footGap: number, scale: number): { x: number; y: number } {
    return { x: this.walkX, y: this.floorY() + footOffset(footGap, scale) + FOOT_NUDGE };
  }

  // ------------------------------------------------------- EditableScene

  getEditableObjects(): EditableObject[] {
    const motion: LocomotionMotion = 'idle';
    const frame = resolveLocomotionFrame(this.character, motion, this.time.now);
    const baseScale = (): number =>
      resolveGameplayScale(this.character, resolveLocomotionPose(this.character, motion));
    return [
      // The ambient crowd exposes its own objects, so a room with a different
      // set of groups is editable without this scene knowing what is in it.
      ...(this.npcs?.getEditableObjects() ?? []),
      ...(this.storyActor ? [this.storyActorEditable(this.storyActor)] : []),
      createPlayerEditable(this, {
        sprite: this.playerSprite,
        getAnchor: () => this.playerAnchor(frame.footGap, baseScale()),
        getBaseScale: baseScale,
        refresh: () => this.applyWalkFrame(false),
      }),
    ];
  }

  buildEditorSave(
    snapshot: readonly { id: string; x: number; y: number; scaleX: number; scaleY: number }[],
  ): EditorSavePayload[] {
    const payloads: EditorSavePayload[] = [
      { route: '/__scene-editor/save-layout', body: buildSceneLayoutPayload(this.scene.key) },
    ];
    const npcs = this.npcs;
    if (npcs) {
      payloads.push({
        route: '/__club-editor/save-npcs',
        body: { roomId: npcs.getRoomId(), placements: npcs.buildLayoutFromSnapshot(snapshot) },
      });
    }
    return payloads;
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

    this.loadRoomNpcs(room.id);
    this.buildStoryActor(room.id);
    this.prefetchNeighbour(roomIndex + 1);
  }

  private buildStoryActor(roomId: string): void {
    this.storyActor?.mask?.destroy();
    this.storyActor?.sprite.destroy();
    this.storyActor = undefined;
    const slot = clubStorySlotForRoom(roomId);
    if (!slot) return;
    const character = characterForClubStorySlot(this.storyCast, slot);
    const frame = resolveLocomotionFrame(character, 'idle', this.time.now);
    const sprite = this.add
      .sprite(0, 0, frame.key)
      .setOrigin(0.5, 1)
      .setDepth(Depth.ENVIRONMENT + 2);
    const actor: ClubStoryActor = { slot, character, sprite };
    if (CLUB_STORY_PLACEMENTS[slot].waistCrop) {
      const mask = this.make.graphics({}, false);
      sprite.setMask(mask.createGeometryMask());
      actor.mask = mask;
    }
    this.storyActor = actor;
    this.layoutStoryActor();
  }

  private layoutStoryActor(): void {
    const actor = this.storyActor;
    if (!actor) return;
    const placement = CLUB_STORY_PLACEMENTS[actor.slot];
    const saved = getSceneObjectLayout(this.scene.key, placement.layoutId);
    const frame = resolveLocomotionFrame(actor.character, 'idle', this.time.now);
    const baseScale = resolveGameplayScale(actor.character, 'idle');
    const authoredScale = saved?.scale ?? placement.scale;
    const scale = baseScale * authoredScale;
    const x = (saved?.xRatio ?? placement.xRatio) * this.cameras.main.width;
    const baseline = (saved?.yRatio ?? placement.baselineRatio) * this.cameras.main.height;
    actor.sprite
      .setTexture(frame.key)
      .setScale(scale)
      .setPosition(x, baseline + footOffset(frame.footGap, scale));
    this.layoutStoryMask(actor, frame.bodyHeight * scale);
  }

  /** Keeps the barkeeper's waist crop attached to their edited transform. */
  private layoutStoryMask(actor: ClubStoryActor, visibleBodyHeight: number): void {
    const mask = actor.mask;
    if (!mask) return;
    const waistY = actor.sprite.y - visibleBodyHeight * 0.44;
    mask.clear().fillStyle(0xffffff).fillRect(0, 0, this.cameras.main.width, waistY);
  }

  private storyActorEditable(actor: ClubStoryActor): EditableObject {
    const placement = CLUB_STORY_PLACEMENTS[actor.slot];
    return {
      id: placement.layoutId,
      label: actor.slot === 'barkeeper' ? 'BARKEEPER' : `STORY ${actor.slot.toUpperCase()}`,
      target: actor.sprite,
      getNativeSize: () => ({ width: actor.sprite.frame.realWidth, height: actor.sprite.frame.realHeight }),
      onChange: (transform) => {
        const frame = resolveLocomotionFrame(actor.character, 'idle', this.time.now);
        const baseScale = resolveGameplayScale(actor.character, 'idle');
        const scale = transform.scaleY;
        setSceneObjectLayout(this.scene.key, placement.layoutId, {
          xRatio: this.cameras.main.width > 0 ? transform.x / this.cameras.main.width : 0,
          yRatio: this.cameras.main.height > 0
            ? (transform.y - footOffset(frame.footGap, scale)) / this.cameras.main.height
            : 0,
          scale: baseScale > 0 ? scale / baseScale : placement.scale,
        });
        this.layoutStoryMask(actor, frame.bodyHeight * scale);
      },
    };
  }

  private checkStoryTrigger(): void {
    const actor = this.storyActor;
    if (!actor || this.completedStorySlots.has(actor.slot) || this.activeStorySlot) return;
    if (Math.abs(this.walkX - actor.sprite.x) > STORY_TRIGGER_DISTANCE) return;
    this.startStoryDialogue(actor.slot);
  }

  private startStoryDialogue(slot: ClubStorySlot): void {
    if (this.activeStorySlot || this.completedStorySlots.has(slot) || this.finished) return;
    this.activeStorySlot = slot;
    this.transitioning = true;
    this.applyWalkFrame(false);
    const character = characterForClubStorySlot(this.storyCast, slot);
    void launchCurrentSceneDialogue(this, {
      script: buildClubRoomDialogue(slot, character.id),
      resumeEvent: CLUB_DIALOGUE_RESUMED_EVENT,
      resumePayload: { slot },
    }).catch((error: unknown) => {
      console.error('[ClubScene] could not open story dialogue', error);
      this.activeStorySlot = undefined;
      this.transitioning = false;
    });
  }

  private onStoryDialogueComplete(payload: { slot?: ClubStorySlot }): void {
    const slot = payload.slot ?? this.activeStorySlot;
    if (slot) this.completedStorySlots.add(slot);
    this.activeStorySlot = undefined;
    this.transitioning = false;
    this.applyWalkFrame(false);
  }

  /**
   * Builds the room's crowd, loading only that room's artwork and only the
   * frames not already in the texture manager — so walking into the lounge
   * never costs the backstage's groups, and walking back into a room already
   * visited costs nothing at all.
   *
   * `setRoom` runs immediately so a revisited room populates on the same
   * frame, and again on load completion for a first visit; it skips
   * placements whose frames are missing rather than drawing an error texture,
   * which is what makes that two-phase call safe.
   */
  private loadRoomNpcs(roomId: string): void {
    const npcs = this.npcs;
    if (!npcs) return;
    npcs.setRoom(roomId);

    const missing = collectClubNpcFrames(getRoomNpcGroups(roomId)).filter(
      (frame) => !this.textures.exists(frame.key),
    );
    if (missing.length === 0) {
      return;
    }

    for (const frame of missing) this.load.image(frame.key, frame.url);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      // The player may have walked on, or left Level 2 entirely, while this
      // was in flight; rebuilding then would populate the wrong room.
      if (!this.scene.isActive() || this.roomIndexId() !== roomId) return;
      npcs.setRoom(roomId);
    });
    this.load.start();
  }

  /** Id of the room currently being shown. */
  private roomIndexId(): string {
    return CLUB_ROOMS[this.roomIndex]?.id ?? '';
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
    void this.openLevelComplete();
  }

  /** Retains the real final DJ room before ClubScene is torn down. */
  private async openLevelComplete(): Promise<void> {
    let clubStageSnapshot: CurrentSceneSnapshot | undefined;
    try {
      clubStageSnapshot = await captureCurrentSceneSnapshot(
        this,
        'current-scene-club-post-rhythm-dj',
      );
    } catch (error) {
      console.warn('[ClubScene] could not retain final DJ room for post-set dialogue', error);
    }
    if (!this.scene.isActive()) {
      releaseCurrentSceneSnapshot(this.textures, clubStageSnapshot);
      return;
    }

    this.releaseVideo();
    this.scene.start('LevelCompleteScene', {
      // Level 2 is a walk: it awards nothing and simply carries the running
      // total through to Level 3.
      score: this.score,
      maxScore: this.score,
      retryScene: 'ClubScene',
      retryData: { score: this.score, storyCast: this.storyCast },
      continueScene: 'RhythmScene',
      continueData: {
        score: this.score,
        clubStoryCast: this.storyCast,
        clubStageSnapshot,
      },
      retryCleanupTextureKeys: clubStageSnapshot ? [clubStageSnapshot.textureKey] : undefined,
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

    this.walk.layout(camera.width, camera.height);

    // Ratio-based, so the crowd re-seats itself on the new viewport.
    this.npcs?.layout();
    this.layoutStoryActor();

    // Keep the player inside the new width, and on the floor line.
    this.walkX = Phaser.Math.Clamp(this.walkX, EDGE_MARGIN, camera.width - EDGE_MARGIN);
    this.applyWalkFrame(false);
  }

  private cleanup(): void {
    this.releaseVideo();
    this.npcs?.destroy();
    this.npcs = undefined;
    this.storyActor?.mask?.destroy();
    this.storyActor?.sprite.destroy();
    this.storyActor = undefined;
    this.events.off(CLUB_DIALOGUE_RESUMED_EVENT, this.onStoryDialogueComplete, this);
    // Leaving Level 2: every room file is done with, and a retry re-warms
    // from the HTTP cache rather than the network.
    for (const room of CLUB_ROOMS) releasePrefetchedVideo(room.videoUrl);
    this.tweens.killAll();
    this.walk.destroy();
  }
}
