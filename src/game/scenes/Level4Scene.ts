import Phaser from 'phaser';
import {
  Depth,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  GROUND_Y,
} from '../constants';
import { queueCharacterGameplay } from '../characters/characterAssets';
import { footOffset, staticRunFrameIndex } from '../characters/characterAnimation';
import {
  resolveLocomotionFrame,
  resolveLocomotionPose,
} from '../characters/characterLocomotion';
import type { CharacterAssetRef, CharacterDefinition } from '../characters/characterManifest';
import { resolveGameplayScale } from '../characters/characterManifest';
import { getSelectedCharacter } from '../characters/characterSelection';
import { getCharacter } from '../characters/characterRegistry';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import type { ViewportInfo } from '../responsive/ViewportInfo';
import type { LevelCompleteSceneData } from './LevelCompleteScene';
import type { RhythmResult } from '../rhythm/types';
import {
  buildLevel4DialogueBundle,
  chooseLevel4NpcCharacter,
  createEmptyRhythmResult,
  type Level4ResumePayload,
} from '../level/level4/level4Flow';
import {
  getLevel4AssetUrls,
  LEVEL4_ASSET_KEYS,
  TOILET_STRIP_NATIVE_HEIGHT,
  TOILET_STRIP_NATIVE_WIDTH,
  TOILET_TEXTURE_UPSCALE,
} from '../level/level4/level4Assets';
import { WalkInput, WALK_SPEED } from '../systems/WalkControls';
import type { EditableObject } from '../systems/SceneEditor';
import type { EditableScene, EditorSavePayload } from '../systems/editableScene';
import { createPlayerEditable, getPlayerVisualOffset } from '../systems/playerPresentation';
import {
  LEVEL4_EDITABLE_IDS,
  resolveLevel4Placement,
  resolveStallEntryLogicalTargets,
  storeLevel4Placement,
  type Level4Placement,
} from '../level/level4/level4Layout';
import { buildSceneLayoutPayload } from '../systems/sceneLayout';

// Native pixel dimensions of assets/level_4/toilet-full.png. The artwork is
// authored as a short wide strip (floor-to-ceiling height, full room width)
// with a crumbling/transparent right edge that is meant to reveal Holyworld
// behind it as the player walks through it.
const TOILET_STRIP_WIDTH = TOILET_STRIP_NATIVE_WIDTH;
const TOILET_STRIP_HEIGHT = TOILET_STRIP_NATIVE_HEIGHT;

// Native pixel height of assets/level_4/holyworld-background.png.
const HOLYWORLD_BG_HEIGHT = 940;

/** Native row the characters stand on: the floor the stall bases sit on. */
const TOILET_FLOOR_NATIVE_Y_RAW = 147;

/**
 * Horizontal scale for the room, keeping the character's width correct against
 * the fittings it walks past: the strip holds a whole bathroom in 175px, so
 * scaling it uniformly to fill the frame made urinals as tall as the player.
 * Every horizontal position in the level is expressed through this.
 */
const TOILET_HEIGHT_RATIO = 448 / 720;
const TOILET_SCALE = (DESIGN_HEIGHT * TOILET_HEIGHT_RATIO) / TOILET_STRIP_HEIGHT;

/**
 * Vertical scale, chosen so the room fills the frame instead of standing at
 * its own proportional height with dead space above and below it.
 *
 * Derived from the artwork's own floor row rather than its full height: at
 * this scale native y 147 lands exactly on GROUND_Y, so the characters keep
 * standing on the floor the stalls stand on, and the remaining walkway rows
 * carry past the bottom of the frame.
 *
 * Applied on Y only. `TOILET_SCALE` still governs X, so every horizontal
 * position below — the stall, the door, the walk distances, the crumbling
 * edge — is completely unaffected, and the character keeps its correct width
 * relative to the fittings. The artwork is stretched vertically as a result,
 * which is a deliberate trade of physical proportion for a full-height frame.
 */
const TOILET_SCALE_Y = GROUND_Y / TOILET_FLOOR_NATIVE_Y_RAW;

/**
 * The artwork is anchored at the top of the frame; the vertical scale above is
 * what puts its floor row on GROUND_Y, so no y offset is needed any more.
 */
const TOILET_FLOOR_NATIVE_Y = TOILET_FLOOR_NATIVE_Y_RAW;
const TOILET_TOP_Y = 0;

// Native-pixel x where the artwork starts crumbling away to transparency
// (measured against toilet-full.png: fully opaque through x=1050, dropping to
// 93% by x=1100 and 0% by x=1450). Holyworld has to already be in place by
// the first of those holes — placed any later and the earliest cracks in the
// wall show the scene's black clear colour instead of the world beyond it,
// which is what read as a dead gap between the room and Holyworld rather than
// a wall breaking open onto it.
const DISSOLVE_START_X_NATIVE = 1000;
const DISSOLVE_START_X = DISSOLVE_START_X_NATIVE * TOILET_SCALE;
// Native x by which the wall has fully dissolved (0% opaque). Together with
// the start above this is the same crumbling span the artwork already draws;
// nothing here invents a new one.
const DISSOLVE_END_X_NATIVE = 1450;
/**
 * How much further right of the fully-dissolved edge the room's own dark
 * tone keeps eating into Holyworld before giving way completely — the visual
 * difference between "a wall broke and the other world is right there" and
 * "a wall broke and then, several strides later, a screen-filling backdrop
 * begins". Reuses the crumbling span's own width so the two feel like one
 * continuous event rather than two unrelated transitions.
 */
const RUBBLE_BLEED_NATIVE = DISSOLVE_END_X_NATIVE - DISSOLVE_START_X_NATIVE;

// The one stall in the artwork drawn without a door — an open frame with a
// visible toilet bowl — is the portal stall. Its opening was measured off
// toilet-full.png in native pixels; everything the cutscene positions is
// derived from that rect so the door and the actors cannot drift apart.
const STALL_OPENING_LEFT = 665 * TOILET_SCALE;
const STALL_OPENING_RIGHT = 700 * TOILET_SCALE;
const STALL_OPENING_TOP = 50 * TOILET_SCALE_Y;
// The opening's floor row is the row the actors stand on, so this is GROUND_Y.
const STALL_OPENING_BOTTOM = TOILET_FLOOR_NATIVE_Y * TOILET_SCALE_Y;
const STALL_OPENING_WIDTH = STALL_OPENING_RIGHT - STALL_OPENING_LEFT;
const STALL_OPENING_HEIGHT = STALL_OPENING_BOTTOM - STALL_OPENING_TOP;

/**
 * How wide the door is drawn while open, as a fraction of its closed width.
 * The door is hinged on the opening's right edge and only ever narrows toward
 * that hinge — it never rotates and never moves — so an open door reads as a
 * leaf turned edge-on inside the frame rather than one lying on the floor.
 */
const DOOR_OPEN_SCALE = 0.12;
/**
 * Native rows of clearance under the stall door, as a real stall has. It is
 * what leaves the characters' lower legs and feet visible while the door
 * covers their bodies, so a closed door reads as two people standing behind
 * it rather than as an empty frame.
 */
const DOOR_FLOOR_GAP_NATIVE = 7;
/** Editor-only marker radius for PLAYER TARGET / NPC TARGET. */
const TARGET_MARKER_RADIUS = 5;
/** Editor-only "P"/"N" labels above the two markers. */
const TARGET_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Space Mono',
  fontSize: '11px',
  color: '#120b1d',
  backgroundColor: '#ffe36d',
  padding: { x: 3, y: 1 },
};

// Walkway positions, in the same native pixel space as the stall rect.
const PLAYER_START_X = 160 * TOILET_SCALE;
const PLAYER_MIN_X = 40 * TOILET_SCALE;
const NPC_WAIT_X = 645 * TOILET_SCALE;
const NPC_EXIT_X = 555 * TOILET_SCALE;
/** How far past the camera's left edge the NPC walks before being hidden. */
const NPC_EXIT_OFFSCREEN_MARGIN = 160;
/** How close to the waiting NPC the player must walk for them to speak up. */
const DIALOGUE_PROXIMITY = 55 * TOILET_SCALE;

const LEVEL4_WORLD_WIDTH = TOILET_STRIP_WIDTH * TOILET_SCALE + DESIGN_WIDTH;
const NPC_WAIT_FACING: 1 | -1 = -1;

interface Level4Actor {
  sprite: Phaser.GameObjects.Sprite;
  character: CharacterDefinition;
  motion: 'idle' | 'walk';
  x: number;
  y: number;
  facing: 1 | -1;
  currentKey?: string;
}

export interface Level4SceneData {
  rhythmResult?: RhythmResult;
  introComplete?: boolean;
  playerX?: number;
  cameraX?: number;
  npcId?: string;
}

export class Level4Scene extends Phaser.Scene implements EditableScene {
  private rhythmResult: RhythmResult = createEmptyRhythmResult();
  private introComplete = false;
  private playerX = PLAYER_START_X;
  private cameraX = 0;
  private npcId?: string;
  private playerCharacter!: CharacterDefinition;
  private npcCharacter!: CharacterDefinition;
  private player!: Level4Actor;
  private npc!: Level4Actor;
  private holyworldBackground!: Phaser.GameObjects.TileSprite;
  private toiletStrip!: Phaser.GameObjects.Image;
  private stallDoor!: Phaser.GameObjects.Image;
  private rubbleMask!: Phaser.GameObjects.Graphics;
  private walk!: WalkInput;
  /** The door's scaleX when shut, derived from the measured stall opening. */
  private doorClosedScaleX = 1;
  /** Authored visual scale multiplier for the story NPC, on top of its base. */
  private npcScale = 1;
  /** Whether the stall door is currently drawn edge-on; see `onEditorEnable`. */
  private doorOpen = true;
  /**
   * Editor-only transform anchor marking where both characters must walk to
   * after the dialogue. Carries no fill or stroke of its own: the shared
   * SceneEditor already draws a thin idle/selected outline and resize
   * handles for every registered editable object, so this is purely a
   * position/size the editor can grab, never a second, redundant visual on
   * top of it. Never collides with anything, and is only ever visible (as
   * far as it is visible at all — see above) while the editor is open.
   */
  private stallEntryTargetRect!: Phaser.GameObjects.Rectangle;
  /** Small labelled dots inside the target zone showing PLAYER TARGET / NPC TARGET. */
  private playerTargetMarker!: Phaser.GameObjects.Arc;
  private npcTargetMarker!: Phaser.GameObjects.Arc;
  private playerTargetLabel!: Phaser.GameObjects.Text;
  private npcTargetLabel!: Phaser.GameObjects.Text;
  /**
   * Set only while both actors are walking into the stall after the dialogue.
   *
   * Deliberately does not cache the destinations: `stallEntryLogicalTargets()`
   * is re-read every frame so that authoring the zone mid-walk retargets the
   * walk in progress instead of finishing at a stale position.
   */
  private stallEntry?: {
    playerArrived: boolean;
    npcArrived: boolean;
  };
  /**
   * True from the moment both actors have parked in the stall until the NPC
   * leaves. While set, authoring the target zone re-seats them live — see
   * `reseatStallOccupants`.
   */
  private stallSettled = false;
  /** True only while the dialogue hand-off and the stall cutscene are running. */
  private controlsLocked = false;
  /** Restored when the editor closes, so it cannot free a cutscene's controls. */
  private controlsLockedBeforeEditor = false;
  private dialogueTriggered = false;
  private finished = false;

  constructor() {
    super('Level4Scene');
  }

  init(data: Partial<Level4SceneData>): void {
    this.rhythmResult = data.rhythmResult ?? createEmptyRhythmResult();
    this.introComplete = data.introComplete === true;
    this.playerX = data.playerX ?? PLAYER_START_X;
    this.cameraX = data.cameraX ?? 0;
    this.npcId = data.npcId;
    this.controlsLocked = false;
    // Coming back from DialogueScene the conversation has already happened.
    // Without this the resumed scene would re-arm the proximity trigger and
    // walk straight back into DialogueScene, looping forever at the stall.
    this.dialogueTriggered = this.introComplete;
    this.finished = false;
  }

  preload(): void {
    this.playerCharacter = getSelectedCharacter();
    this.npcCharacter = this.npcId ? getCharacter(this.npcId) : chooseLevel4NpcCharacter(this.playerCharacter);
    queueCharacterGameplay(this, this.playerCharacter);
    queueCharacterGameplay(this, this.npcCharacter);
    for (const asset of getLevel4AssetUrls()) this.load.image(asset.key, asset.url);
  }

  create(): void {
    attachFullscreenExitControl(this);
    this.cameras.main.setBackgroundColor('#0a0612');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    this.buildBackground();
    this.buildRubbleMask();
    this.buildToiletStrip();
    this.buildActors();
    this.buildDoor();
    this.buildStallEntryTarget();

    // Same manual walk control as the Level 2 walk: arrows/A-D on desktop,
    // hold either half of the screen on touch. Below Depth.UI so the pause,
    // sound and fullscreen controls still win the pointer.
    this.walk = new WalkInput(this, { zoneDepth: Depth.UI - 5 });

    this.cameras.main.setBounds(0, 0, LEVEL4_WORLD_WIDTH, DESIGN_HEIGHT);
    this.cameras.main.startFollow(this.player.sprite, true, 0.08, 0.08, -220, 0);
    this.cameras.main.setScroll(this.cameraX, 0);

    new OrientationController(this, {
      onLayout: (viewport) => this.applyResponsiveLayout(viewport),
    });
    this.applyResponsiveLayout();

    if (this.introComplete) {
      this.player.x = this.playerX;
      this.cameraX = Math.max(0, this.cameraX);
      this.syncActor(this.player, this.time.now);
      this.syncActor(this.npc, this.time.now);
      this.startPostDialogueCutscene();
    }
  }

  private buildBackground(): void {
    // Holyworld lives in world space (not scroll-locked) starting where the
    // toilet artwork's right edge begins crumbling away, so it only becomes
    // visible through that transparent/broken edge rather than dominating
    // the screen from the start. It is drawn at the toilet strip's own
    // native pixel scale so it tiles seamlessly to the end of the level.
    const tileScale = DESIGN_HEIGHT / HOLYWORLD_BG_HEIGHT;
    const width = LEVEL4_WORLD_WIDTH - DISSOLVE_START_X;
    this.holyworldBackground = this.add
      .tileSprite(DISSOLVE_START_X, 0, width, DESIGN_HEIGHT, LEVEL4_ASSET_KEYS.holyworldBackground)
      .setOrigin(0, 0)
      .setTileScale(tileScale, tileScale)
      .setDepth(Depth.SKY);
  }

  /**
   * Extends the room's own near-black tone a stride further into Holyworld
   * than the wall's alpha alone reaches, in blocky steps rather than a smooth
   * fade — the wall is pixel art breaking apart, not glass smearing into fog.
   *
   * Sits between the background (`Depth.SKY`) and the toilet strip
   * (`Depth.ENVIRONMENT + 5`): the strip's own crumbling alpha is still the
   * only thing that makes any of this visible, this only changes what the
   * strip's holes reveal for a while — hand-painted rubble silhouette rather
   * than Holyworld already at full brightness the instant a hole opens.
   * Drawn once against the level's fixed geometry (not the viewport), so it
   * holds up at every camera size the same way the toilet strip itself does.
   */
  private buildRubbleMask(): void {
    const start = DISSOLVE_START_X;
    const span = RUBBLE_BLEED_NATIVE * TOILET_SCALE;
    // Four receding steps: tall chunks close to the wall, tapering to
    // nothing by the far edge, top and bottom mirrored around the room's own
    // dark tone (`toneColor`) — a jagged skyline eaten away rather than a
    // rectangle with a straight edge.
    const steps = [
      { xFrac: 0, heightFrac: 0.42 },
      { xFrac: 0.28, heightFrac: 0.3 },
      { xFrac: 0.55, heightFrac: 0.19 },
      { xFrac: 0.8, heightFrac: 0.09 },
    ];
    const toneColor = 0x0a0612; // matches the camera's own clear colour
    this.rubbleMask = this.add.graphics().setDepth(Depth.SKY + 1);
    this.rubbleMask.fillStyle(toneColor, 1);
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const next = steps[i + 1];
      const left = start + step.xFrac * span;
      const right = start + (next ? next.xFrac : 1) * span;
      const height = step.heightFrac * DESIGN_HEIGHT;
      this.rubbleMask.fillRect(left, 0, right - left, height);
      this.rubbleMask.fillRect(left, DESIGN_HEIGHT - height, right - left, height);
    }
  }

  /**
   * The composed default, used until someone authors the room in the editor.
   * Deliberately non-uniform: X keeps the room's proportion against the
   * character, Y stretches it to fill the frame. Both divided by the
   * texture's own upscale so the scales stay expressed in authored pixels.
   */
  private defaultToiletPlacement(): Level4Placement {
    return {
      x: 0,
      y: TOILET_TOP_Y,
      scaleX: TOILET_SCALE / TOILET_TEXTURE_UPSCALE,
      scaleY: TOILET_SCALE_Y / TOILET_TEXTURE_UPSCALE,
    };
  }

  private buildToiletStrip(): void {
    const placement = resolveLevel4Placement(
      this.scene.key,
      LEVEL4_EDITABLE_IDS.toilet,
      this.defaultToiletPlacement(),
      this.editorViewport(),
    );
    this.toiletStrip = this.add
      .image(placement.x, placement.y, LEVEL4_ASSET_KEYS.toiletStrip)
      .setOrigin(0, 0)
      .setScale(placement.scaleX, placement.scaleY)
      .setDepth(Depth.ENVIRONMENT + 5);
  }

  private buildActors(): void {
    this.player = this.createActor(this.playerCharacter, this.playerX, GROUND_Y, 1, 'idle');
    // The NPC's wait position is authored, not fixed: `syncActor` renders from
    // `actor.x/y`, so writing the editor's result here is what makes a drag
    // survive both the next frame and the next scene entry.
    const npcPlacement = resolveLevel4Placement(
      this.scene.key,
      LEVEL4_EDITABLE_IDS.npc,
      { x: NPC_WAIT_X, y: GROUND_Y, scaleX: 1, scaleY: 1 },
      this.editorViewport(),
    );
    this.npcScale = npcPlacement.scaleY;
    this.npc = this.createActor(
      this.npcCharacter,
      npcPlacement.x,
      npcPlacement.y,
      NPC_WAIT_FACING,
      'idle',
    );
  }

  /** The viewport the authored ratios are expressed against. */
  private editorViewport(): { width: number; height: number } {
    const camera = this.cameras.main;
    return { width: camera.width, height: camera.height };
  }

  /** Where the story NPC is actually standing, which the trigger follows. */
  private npcWaitX(): number {
    return this.npc?.x ?? NPC_WAIT_X;
  }

  private buildDoor(): void {
    // Sized and placed to fill the measured stall opening exactly, hinged on
    // the opening's bottom-right corner. It stays upright for the whole level
    // and is never repositioned — only its width changes — so it can never
    // rotate onto the floor or travel with a character.
    this.stallDoor = this.add
      .image(STALL_OPENING_RIGHT, STALL_OPENING_BOTTOM, LEVEL4_ASSET_KEYS.stallDoor)
      .setOrigin(1, 1)
      .setDepth(Depth.FOREGROUND + 10);
    // Measured default first, so the authored entry only has to carry what
    // was actually changed.
    this.stallDoor.setDisplaySize(STALL_OPENING_WIDTH, STALL_OPENING_HEIGHT);
    const placement = resolveLevel4Placement(
      this.scene.key,
      LEVEL4_EDITABLE_IDS.stallDoor,
      {
        x: STALL_OPENING_RIGHT,
        y: STALL_OPENING_BOTTOM - DOOR_FLOOR_GAP_NATIVE * TOILET_SCALE_Y,
        scaleX: this.stallDoor.scaleX,
        scaleY: this.stallDoor.scaleY,
      },
      this.editorViewport(),
    );
    this.stallDoor.setPosition(placement.x, placement.y).setScale(placement.scaleX, placement.scaleY);
    // The authored width is the *closed* one; the open pose is derived from it
    // every time, so editing the door never desynchronises the swing.
    this.doorClosedScaleX = this.stallDoor.scaleX;
    this.stallDoor.scaleX = this.doorClosedScaleX * DOOR_OPEN_SCALE;
    this.doorOpen = true;
    // The open pose is a sliver at DOOR_OPEN_SCALE width, not an absence — it
    // stayed on screen as a thin vertical strip drawn in front of whoever
    // stood behind it. Hidden outright while open; only the close animation
    // (which needs to be seen swinging shut) makes it visible again.
    this.stallDoor.setVisible(false);
  }

  /**
   * The stall-entry target zone.
   *
   * A separate authored thing from the door on purpose: the door's own
   * editor entry can be moved without silently dragging the target zone with
   * it, so a designer nudging the door's fit does not also relocate where
   * the cutscene walks. It is only initialised *from* the stall opening
   * (fixed measured constants, not the door's live position) the first time
   * nothing has been authored yet, so a fresh layout still starts somewhere
   * sensible.
   */
  private buildStallEntryTarget(): void {
    const placement = resolveLevel4Placement(
      this.scene.key,
      LEVEL4_EDITABLE_IDS.stallEntryTarget,
      {
        x: (STALL_OPENING_LEFT + STALL_OPENING_RIGHT) / 2,
        y: (STALL_OPENING_TOP + STALL_OPENING_BOTTOM) / 2,
        scaleX: STALL_OPENING_WIDTH,
        scaleY: STALL_OPENING_HEIGHT,
      },
      this.editorViewport(),
    );
    // A 1x1 rectangle scaled to the authored width/height: getNativeSize
    // below reports {1, 1} to match, so the editor's scaleX/scaleY resize
    // reads directly as the zone's pixel size rather than as a multiplier of
    // some inherent artwork size that does not exist here. No fill and no
    // stroke: SceneEditor draws its own thin idle/selected outline and resize
    // handles for it, exactly as it does for every other Level 4 object, so
    // painting a second filled box on top of that would only double it up —
    // which is what made this read as one large translucent block instead of
    // a normal editor helper.
    this.stallEntryTargetRect = this.add
      .rectangle(placement.x, placement.y, 1, 1, 0x000000, 0)
      .setScale(placement.scaleX, placement.scaleY)
      .setDepth(Depth.FOREGROUND + 20)
      .setVisible(false);

    this.playerTargetMarker = this.add
      .circle(0, 0, TARGET_MARKER_RADIUS, 0x7ef0ff, 1)
      .setDepth(Depth.FOREGROUND + 21)
      .setVisible(false);
    this.npcTargetMarker = this.add
      .circle(0, 0, TARGET_MARKER_RADIUS, 0xff7ac1, 1)
      .setDepth(Depth.FOREGROUND + 21)
      .setVisible(false);
    this.playerTargetLabel = this.add
      .text(0, 0, 'P', TARGET_LABEL_STYLE)
      .setOrigin(0.5, 1)
      .setDepth(Depth.FOREGROUND + 21)
      .setVisible(false);
    this.npcTargetLabel = this.add
      .text(0, 0, 'N', TARGET_LABEL_STYLE)
      .setOrigin(0.5, 1)
      .setDepth(Depth.FOREGROUND + 21)
      .setVisible(false);
    this.layoutTargetMarkers();
  }

  /**
   * Where each character walks to, inside the authored zone — for the
   * *marker itself*: what the editor shows and what a designer positioned.
   * Used to draw the markers, where the raw visual position is exactly
   * right; the walk-in uses `stallEntryLogicalTargets` instead, which is the
   * same thing corrected for the player's rendering offset.
   */
  private stallEntryTargets(): { playerX: number; npcX: number } {
    const rect = this.stallEntryTargetRect;
    return resolveStallEntryLogicalTargets({ x: rect.x, y: rect.y, width: rect.scaleX }, 0);
  }

  /**
   * Where the walk-in actually has to drive each actor's *logical* `x` to, so
   * the *rendered* sprite — `actor.x` plus whatever presentation offset the
   * player carries — ends up exactly on the marker. The NPC has no
   * presentation offset in this scene, so its target is unchanged; only the
   * player's is corrected, and by however much is actually authored for
   * whichever character is currently selected, never a fixed number.
   */
  private stallEntryLogicalTargets(): { playerX: number; npcX: number } {
    const rect = this.stallEntryTargetRect;
    const playerOffsetX = this.playerVisualOffset(this.player).offsetX;
    return resolveStallEntryLogicalTargets(
      { x: rect.x, y: rect.y, width: rect.scaleX },
      playerOffsetX,
    );
  }

  /** Repositions the two labelled target markers onto the zone's current bounds. */
  private layoutTargetMarkers(): void {
    const targets = this.stallEntryTargets();
    const y = this.stallEntryTargetRect.y;
    this.playerTargetMarker.setPosition(targets.playerX, y);
    this.npcTargetMarker.setPosition(targets.npcX, y);
    this.playerTargetLabel.setPosition(targets.playerX, y - TARGET_MARKER_RADIUS - 3);
    this.npcTargetLabel.setPosition(targets.npcX, y - TARGET_MARKER_RADIUS - 3);
  }

  private createActor(
    character: CharacterDefinition,
    x: number,
    floorY: number,
    facing: 1 | -1,
    motion: 'idle' | 'walk',
  ): Level4Actor {
    const first =
      character.gameplay.idle ?? character.gameplay.run[staticRunFrameIndex(character.gameplay.run.length)];
    const sprite = this.add.sprite(x, 0, first.key).setOrigin(0.5, 1).setDepth(Depth.PLAYER);
    const actor: Level4Actor = {
      sprite,
      character,
      motion,
      x,
      y: floorY,
      facing,
      currentKey: first.key,
    };
    this.syncActor(actor, this.time.now);
    return actor;
  }

  private resolveActorFrame(actor: Level4Actor, now: number): CharacterAssetRef {
    return resolveLocomotionFrame(actor.character, actor.motion, now);
  }

  private syncActor(actor: Level4Actor, now: number): void {
    const frame = this.resolveActorFrame(actor, now);
    const baseScale = resolveGameplayScale(
      actor.character,
      resolveLocomotionPose(actor.character, actor.motion),
    );
    if (frame.key !== actor.currentKey) {
      actor.sprite.setTexture(frame.key);
      actor.currentKey = frame.key;
    }
    const anchor = this.actorAnchor(actor, frame.footGap, baseScale);
    // Visual only: the editor's saved offset and scale move the drawn sprite,
    // never `actor.x`, so triggers, the cutscene and completion are unaffected.
    const visual = this.playerVisualOffset(actor);
    actor.sprite
      .setFlipX(actor.facing < 0)
      .setScale(baseScale * visual.scale)
      .setPosition(anchor.x + visual.offsetX, anchor.y + visual.offsetY);
  }

  /** Where gameplay wants this actor drawn, before any editor offset. */
  private actorAnchor(actor: Level4Actor, footGap: number, scale: number): { x: number; y: number } {
    return { x: actor.x, y: actor.y + footOffset(footGap, scale) + 10 };
  }

  /** The saved visual override, which only the main player carries. */
  private playerVisualOffset(actor: Level4Actor): {
    offsetX: number;
    offsetY: number;
    scale: number;
  } {
    // The NPC carries no drawing offset — its authored position lives in
    // `actor.x/y` itself — but it does carry an authored scale multiplier.
    if (actor !== this.player) return { offsetX: 0, offsetY: 0, scale: this.npcScale };
    const camera = this.cameras.main;
    return getPlayerVisualOffset(this.scene.key, camera.width, camera.height);
  }

  /**
   * Turns an editor transform on the NPC sprite back into the authored state
   * `syncActor` renders from: the sprite's origin is (0.5, 1), so its y is the
   * drawn feet, and `actorAnchor` adds the scaled foot gap on top of the
   * actor's floor line — both of which have to come back out here or every
   * edit would drift by one foot gap.
   */
  private applyNpcEdit(transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
  }): void {
    const baseScale = resolveGameplayScale(
      this.npc.character,
      resolveLocomotionPose(this.npc.character, this.npc.motion),
    );
    if (baseScale > 0) this.npcScale = transform.scaleY / baseScale;
    const frame = this.resolveActorFrame(this.npc, this.time.now);
    this.npc.x = transform.x;
    // `actorAnchor` seats the sprite using the *base* scale, not the authored
    // multiplier, so the inverse has to use the same one or every edit would
    // drift by one foot gap's worth of the scale change.
    this.npc.y = transform.y - footOffset(frame.footGap, baseScale) - 10;
    storeLevel4Placement(
      this.scene.key,
      LEVEL4_EDITABLE_IDS.npc,
      { x: this.npc.x, y: this.npc.y, scaleX: this.npcScale, scaleY: this.npcScale },
      this.editorViewport(),
    );
  }

  // ------------------------------------------------------- EditableScene

  getEditableObjects(): EditableObject[] {
    return [
      {
        id: LEVEL4_EDITABLE_IDS.toilet,
        label: 'TOILET ROOM',
        target: this.toiletStrip,
        getNativeSize: () => ({ width: TOILET_STRIP_WIDTH, height: TOILET_STRIP_HEIGHT }),
        allowNonUniformScale: true,
        // Written straight into the authored layout the scene rebuilds from,
        // so P saves the value that was actually edited and the next entry
        // reproduces it instead of the composed default.
        onChange: (transform) =>
          storeLevel4Placement(
            this.scene.key,
            LEVEL4_EDITABLE_IDS.toilet,
            {
              x: transform.x,
              y: transform.y,
              scaleX: transform.scaleX,
              scaleY: transform.scaleY,
            },
            this.editorViewport(),
          ),
      },
      {
        id: LEVEL4_EDITABLE_IDS.stallDoor,
        label: 'STALL DOOR',
        target: this.stallDoor,
        getNativeSize: () => ({
          width: this.stallDoor.frame.realWidth,
          height: this.stallDoor.frame.realHeight,
        }),
        allowNonUniformScale: true,
        onChange: (transform) => {
          // The door is drawn open while the level plays, so the edited width
          // becomes the new *closed* baseline the swing is derived from.
          this.doorClosedScaleX = transform.scaleX;
          storeLevel4Placement(
            this.scene.key,
            LEVEL4_EDITABLE_IDS.stallDoor,
            {
              x: transform.x,
              y: transform.y,
              scaleX: transform.scaleX,
              scaleY: transform.scaleY,
            },
            this.editorViewport(),
          );
        },
      },
      {
        id: LEVEL4_EDITABLE_IDS.stallEntryTarget,
        label: 'STALL ENTRY TARGET',
        target: this.stallEntryTargetRect,
        // 1x1 native size: scaleX/scaleY are read directly as the zone's
        // pixel width/height. Never a `remove`/`clone` — this is a single
        // authored zone, not something the scene spawns copies of.
        getNativeSize: () => ({ width: 1, height: 1 }),
        allowNonUniformScale: true,
        onChange: (transform) => {
          storeLevel4Placement(
            this.scene.key,
            LEVEL4_EDITABLE_IDS.stallEntryTarget,
            {
              x: transform.x,
              y: transform.y,
              scaleX: transform.scaleX,
              scaleY: transform.scaleY,
            },
            this.editorViewport(),
          );
          this.layoutTargetMarkers();
          // Moves anyone already standing in the stall onto the new target,
          // so dragging P/N is visibly what repositions them in the cabin.
          this.reseatStallOccupants();
        },
      },
      {
        id: LEVEL4_EDITABLE_IDS.npc,
        label: `STORY NPC (${this.npcCharacter.name})`,
        target: this.npc.sprite,
        getNativeSize: () => ({
          width: this.npc.sprite.frame.realWidth,
          height: this.npc.sprite.frame.realHeight,
        }),
        // `syncActor` re-derives this sprite's transform from `actor.x/y` and
        // the authored scale every frame, so writing only the sprite was
        // overwritten on the very next update. Writing the authored state
        // instead makes the edit what the runtime renders from — no snap-back,
        // and the dialogue trigger follows because it reads the same value.
        onChange: (transform) => this.applyNpcEdit(transform),
      },
      createPlayerEditable(this, {
        sprite: this.player.sprite,
        // Resolved per call, not from a frame captured when the objects were
        // registered: `syncActor` seats the sprite using whichever locomotion
        // frame is live that instant, so an anchor built from a stale frame's
        // `footGap` disagrees with where the sprite is actually drawn, and
        // every drag banks that difference into the saved offset — the edit
        // then reproduces somewhere other than where it was placed.
        getAnchor: () =>
          this.actorAnchor(
            this.player,
            this.resolveActorFrame(this.player, this.time.now).footGap,
            resolveGameplayScale(
              this.player.character,
              resolveLocomotionPose(this.player.character, this.player.motion),
            ),
          ),
        getBaseScale: () =>
          resolveGameplayScale(
            this.player.character,
            resolveLocomotionPose(this.player.character, this.player.motion),
          ),
        refresh: () => this.syncActor(this.player, this.time.now),
      }),
    ];
  }

  buildEditorSave(): EditorSavePayload {
    return {
      route: '/__scene-editor/save-layout',
      body: buildSceneLayoutPayload(this.scene.key),
    };
  }

  /**
   * Freezes the walk so the character stays put while being positioned, and
   * restores exactly the previous state on exit — a cutscene that was already
   * holding the controls must stay in control of them.
   */
  onEditorEnable(): void {
    this.controlsLockedBeforeEditor = this.controlsLocked;
    this.controlsLocked = true;
    // The stall sequence runs on tweens and `delayedCall`s, not on the walk
    // controls, so locking those alone left it advancing underneath the
    // editor: open E while the pair are standing in the closed stall — the
    // one moment you actually need it, to fix a limb poking out past the
    // door — and the 4s `delayedCall` fires mid-edit, the door reopens, the
    // NPC walks out and the level finishes, tearing the scene (and the
    // unsaved edit) down before P can be pressed. Freezing the scene clock
    // and the tweens holds the pose still for as long as it takes to author
    // it; the editor's own input is pointer/keyboard-driven and unaffected.
    this.time.paused = true;
    this.tweens.pauseAll();
    // The door spends the level drawn edge-on at 12% width, which is both
    // impossible to grab and the wrong number to author: what is stored is the
    // *closed* width the swing is derived from. Showing it closed while
    // editing makes the handle usable and makes the edited value already be
    // the one that gets saved. It may also be hidden outright (the open pose
    // is invisible now), so force it back on regardless of `doorOpen`.
    this.stallDoor.setVisible(true);
    this.stallDoor.scaleX = this.doorClosedScaleX;
    // The target zone and its markers are noise during normal play — shown
    // only while there is something to author them against.
    this.stallEntryTargetRect.setVisible(true);
    this.playerTargetMarker.setVisible(true);
    this.npcTargetMarker.setVisible(true);
    this.playerTargetLabel.setVisible(true);
    this.npcTargetLabel.setVisible(true);
  }

  onEditorDisable(): void {
    this.controlsLocked = this.controlsLockedBeforeEditor;
    this.time.paused = false;
    this.tweens.resumeAll();
    this.stallDoor.scaleX = this.doorOpen
      ? this.doorClosedScaleX * DOOR_OPEN_SCALE
      : this.doorClosedScaleX;
    // Restores whichever visibility matches runtime state: hidden if the
    // sequence had it open, visible if it was genuinely closed.
    this.stallDoor.setVisible(!this.doorOpen);
    this.stallEntryTargetRect.setVisible(false);
    this.playerTargetMarker.setVisible(false);
    this.npcTargetMarker.setVisible(false);
    this.playerTargetLabel.setVisible(false);
    this.npcTargetLabel.setVisible(false);
  }

  private applyResponsiveLayout(viewport?: ViewportInfo): void {
    const camera = this.cameras.main;
    this.cameraX = Phaser.Math.Clamp(this.cameraX, 0, Math.max(0, LEVEL4_WORLD_WIDTH - camera.width));
    this.walk.layout(camera.width, camera.height);
    this.syncActor(this.player, this.time.now);
    this.syncActor(this.npc, this.time.now);
    this.cameras.main.setScroll(this.cameraX, 0);
    if (viewport) {
      // Keep the composition consistent after resize; the actual gameplay
      // geometry remains world-space and untouched.
      this.cameras.main.setBounds(0, 0, LEVEL4_WORLD_WIDTH, DESIGN_HEIGHT);
    }
  }

  update(_time: number, delta: number): void {
    if (this.finished) return;
    const now = this.time.now;

    if (this.stallEntry) {
      this.advanceStallEntry(delta);
    } else if (!this.controlsLocked) {
      const direction = this.walk.direction;
      if (direction !== 0) {
        this.player.facing = direction;
        this.player.x = Phaser.Math.Clamp(
          this.player.x + (direction * WALK_SPEED * delta) / 1000,
          PLAYER_MIN_X,
          this.finishThreshold(),
        );
      }
      this.player.motion = direction === 0 ? 'idle' : 'walk';

      // Reads the NPC's authored position, not the constant, so moving them
      // in the editor moves the conversation trigger with them instead of
      // leaving an invisible trigger behind at the composed default.
      if (!this.dialogueTriggered && this.player.x >= this.npcWaitX() - DIALOGUE_PROXIMITY) {
        this.startDialogue();
        return;
      }
      if (this.player.x >= this.finishThreshold()) {
        this.finishLevel();
        return;
      }
    }

    this.syncActor(this.player, now);
    this.syncActor(this.npc, now);
    this.cameraX = this.cameras.main.scrollX;
  }

  private startDialogue(): void {
    if (this.dialogueTriggered || this.finished) return;
    this.dialogueTriggered = true;
    this.controlsLocked = true;
    this.player.motion = 'idle';
    this.npc.motion = 'idle';
    const bundle = buildLevel4DialogueBundle(this.playerCharacter, this.npcCharacter);
    const payload: Level4ResumePayload = {
      introComplete: true,
      playerX: this.player.x,
      cameraX: this.cameras.main.scrollX,
      npcId: this.npcCharacter.id,
      rhythmResult: this.rhythmResult,
    };
    this.scene.start('DialogueScene', {
      script: bundle.script,
      sceneCast: bundle.sceneCast,
      payload,
    });
  }

  /**
   * Both characters walk into the authored STALL ENTRY TARGET zone.
   *
   * Driven frame by frame from `update()`, at the same walk speed normal
   * gameplay uses, rather than a fixed-duration tween: the door-close
   * sequence starts only once each actor's *actual position* has reached its
   * target, so neither a slow nor a long walk can let the door close early,
   * and neither actor can overshoot past where it was told to stop.
   */
  private startPostDialogueCutscene(): void {
    this.controlsLocked = true;
    this.player.motion = 'walk';
    this.npc.motion = 'walk';

    this.stallSettled = false;
    this.stallEntry = { playerArrived: false, npcArrived: false };
  }

  /** Advances both actors toward their stall-entry targets by one frame. */
  private advanceStallEntry(delta: number): void {
    const entry = this.stallEntry;
    if (!entry) return;
    const step = (WALK_SPEED * delta) / 1000;
    // Read live rather than cached at kick-off, so dragging the zone while
    // the pair are still walking redirects them instead of being ignored.
    const targets = this.stallEntryLogicalTargets();

    const advance = (actor: Level4Actor, targetX: number, arrived: boolean): boolean => {
      if (arrived) return true;
      const diff = targetX - actor.x;
      if (Math.abs(diff) <= step) {
        actor.x = targetX;
        actor.motion = 'idle';
        return true;
      }
      actor.facing = diff > 0 ? 1 : -1;
      actor.x += Math.sign(diff) * step;
      return false;
    };

    entry.playerArrived = advance(this.player, targets.playerX, entry.playerArrived);
    entry.npcArrived = advance(this.npc, targets.npcX, entry.npcArrived);

    if (entry.playerArrived && entry.npcArrived) {
      this.stallEntry = undefined;
      this.stepIntoStall();
    }
  }

  /**
   * Re-seats actors already parked in the stall onto freshly authored targets.
   *
   * Without this, authoring the zone once the walk-in has finished changed only
   * the markers: `actor.x` was set when they arrived and nothing reads the zone
   * again, so the pair stayed put and the edit looked like it had been
   * discarded. This is the channel that actually moves a character standing in
   * the stall — the PLAYER offset cannot, because
   * `resolveStallEntryLogicalTargets` subtracts exactly the offset that
   * `syncActor` then adds back, by design, so that the marker stays the single
   * authority for where the pair come to rest.
   */
  private reseatStallOccupants(): void {
    if (!this.stallSettled) return;
    const targets = this.stallEntryLogicalTargets();
    this.player.x = targets.playerX;
    this.npc.x = targets.npcX;
    this.syncActor(this.player, this.time.now);
    this.syncActor(this.npc, this.time.now);
  }

  /**
   * Both are standing in the opening and stay there, visible.
   *
   * They are not faded out: the door is drawn at `Depth.FOREGROUND + 10` and
   * the actors at `Depth.PLAYER`, so ordinary depth composition puts the
   * closed door in front of their bodies, and the door's floor gap leaves
   * their lower legs showing underneath it. Making them vanish instead was
   * what turned a stall with two people in it into an empty frame.
   */
  private stepIntoStall(): void {
    this.player.motion = 'idle';
    this.npc.motion = 'idle';
    this.stallSettled = true;
    this.time.delayedCall(180, () => this.closeDoorThenWait());
  }

  private closeDoorThenWait(): void {
    // Made visible again before the tween starts: it was hidden outright at
    // the end of the previous open pose (see `openDoorAndExit`), and the
    // closing swing has to actually be seen.
    this.stallDoor.setVisible(true);
    // Only the door's width animates. Its position and its upright pose are
    // fixed to the stall opening, so it cannot swing onto the floor or drift
    // toward whoever is standing next to it.
    this.tweens.add({
      targets: this.stallDoor,
      scaleX: this.doorClosedScaleX,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.doorOpen = false;
        this.time.delayedCall(4000, () => this.openDoorAndExit());
      },
    });
  }

  private openDoorAndExit(): void {
    this.tweens.add({
      targets: this.stallDoor,
      scaleX: this.doorClosedScaleX * DOOR_OPEN_SCALE,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.doorOpen = true;
        // The open pose is a sliver, not an absence: hide it once the swing
        // has actually finished so no thin vertical strip is left standing
        // in front of the NPC's exit walk.
        this.stallDoor.setVisible(false);
        this.walkNpcOut();
      },
    });
  }

  /**
   * The NPC leaves on foot and stays visible for the whole walk.
   *
   * The exit target is off the left edge of what the camera is showing rather
   * than a fixed world x, so the NPC is only hidden once they have actually
   * carried themselves out of the visible staging area — previously they were
   * switched off mid-frame, in plain view.
   */
  private walkNpcOut(): void {
    // The pair are no longer parked on the zone, so authoring it must stop
    // dragging them around mid-exit.
    this.stallSettled = false;
    this.npc.facing = -1;
    this.npc.motion = 'walk';
    const exitX = Math.min(
      NPC_EXIT_X,
      this.cameras.main.scrollX - NPC_EXIT_OFFSCREEN_MARGIN,
    );
    this.tweens.add({
      targets: this.npc,
      x: exitX,
      duration: 1100,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.npc.motion = 'idle';
        // Hidden only now, once the walk has taken them out of frame; control
        // returns at the same moment, exactly as the sequence already did.
        this.npc.sprite.setVisible(false);
        this.resumePlay();
      },
    });
  }

  /** Hands control back: from here the player walks on under their own input. */
  private resumePlay(): void {
    if (this.finished) return;
    this.player.motion = 'idle';
    this.controlsLocked = false;
  }

  private finishLevel(): void {
    if (this.finished) return;
    this.finished = true;
    this.controlsLocked = true;
    this.scene.start('LevelCompleteScene', {
      score: 0,
      maxScore: 0,
      retryScene: 'Level4Scene',
      continueScene: 'BossScene',
      continueData: {
        rhythmResult: this.rhythmResult,
      },
    } satisfies LevelCompleteSceneData);
  }

  private finishThreshold(): number {
    return TOILET_STRIP_WIDTH * TOILET_SCALE + this.cameras.main.width / 2 + 16;
  }

  private cleanup(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.walk?.destroy();
    this.holyworldBackground?.destroy();
    this.rubbleMask?.destroy();
    this.toiletStrip?.destroy();
    this.stallDoor?.destroy();
    this.player?.sprite.destroy();
    this.npc?.sprite.destroy();
  }
}
