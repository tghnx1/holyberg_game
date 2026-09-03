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
import { getRuntimeAssetQualityProfile } from '../responsive/AssetQuality';
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
  resolveCameraStopScroll,
  resolveLevel4CutsceneConfig,
  resolveLevel4Placement,
  resolveStallEntryLogicalTargets,
  storeLevel4Placement,
  type Level4CutsceneConfig,
  type Level4Placement,
} from '../level/level4/level4Layout';
import { buildSceneLayoutPayload } from '../systems/sceneLayout';
import { isSceneEditorActive } from '../systems/sceneEditorState';

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
/**
 * Extra pixels each rubble-mask rectangle overlaps past its own edges: left
 * into the still-opaque wall (harmless — the toilet strip is drawn in front
 * and hides it) and top/bottom past its own height. Closes the sliver of
 * Holyworld that otherwise showed between the wall's own dark ceiling/floor
 * pixels and this mask's flat rectangles, which is where the two darknesses
 * are close but not exactly the same shade or the same edge.
 */
const RUBBLE_MASK_SEAM_PX = 8;
/** Height of each rubble-mask bar, as a fraction of the screen. */
const RUBBLE_MASK_HEIGHT_FRAC = 0.26;

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
/**
 * Spacing of the editor-only world ruler, in world pixels.
 *
 * The ruler exists to make the level's coordinate model *visible*: a labelled
 * line every this many world px, drawn in world space like everything else in
 * the room. Open the editor at the same player position on two devices and
 * the same ruler mark must sit against the same tile, stall and character on
 * both. If it does, every world object is on the canonical system and any
 * remaining difference is the camera showing a wider slice; if it does not,
 * something is still being placed from the viewport. It is the check that
 * settles that question without a screenshot comparison by eye.
 */
const WORLD_RULER_SPACING = 500;
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
/**
 * World px/s the story NPC leaves at. A pace, not a duration, so a wider
 * frame — which is a longer walk out of it — does not make the same stride
 * play faster on a phone than on a desktop. Matches the ~527 px/s the exit
 * ran at on a 16:9 frame, so desktop pacing is unchanged.
 */
const NPC_EXIT_SPEED = 527;
/** How close to the waiting NPC the player must walk for them to speak up. */
const DIALOGUE_PROXIMITY = 55 * TOILET_SCALE;

const LEVEL4_WORLD_WIDTH = TOILET_STRIP_WIDTH * TOILET_SCALE + DESIGN_WIDTH;
const NPC_WAIT_FACING: 1 | -1 = -1;

/**
 * Defaults for the toilet-to-Holyworld gap cutscene (see
 * `resolveLevel4CutsceneConfig`), all overridden the moment any of them is
 * authored in the Visual Editor — nothing here is a permanent gameplay
 * hardcode, only what a fresh, never-edited layout starts from.
 *
 * There is no floor collider anywhere in Level 4 — every character always
 * walks at a fixed `GROUND_Y`, the same way the stall-entry zone above is a
 * pure authored rectangle rather than a physics trigger — so the "first
 * gap" is authored entirely by `AUTO_FALL_ZONE_DEFAULT` rather than measured
 * off any collision geometry that does not exist.
 */
const TOILET_RIGHT_EDGE_X = TOILET_STRIP_WIDTH * TOILET_SCALE;
const AUTO_WALK_TRIGGER_X_DEFAULT = TOILET_RIGHT_EDGE_X - 40;
/**
 * World x the locked cinematic frame centres on, expressed in the same
 * canonical design space as every other authored position here — never a raw
 * `scrollX`, which would mean a different composition on every aspect ratio.
 * A little behind the auto-walk trigger, so the character walks the last
 * stretch toward the gap across the middle of a settled frame.
 */
const CAMERA_STOP_FOCUS_X_DEFAULT = Phaser.Math.Clamp(
  AUTO_WALK_TRIGGER_X_DEFAULT - DESIGN_WIDTH * 0.05,
  DESIGN_WIDTH / 2,
  LEVEL4_WORLD_WIDTH - DESIGN_WIDTH / 2,
);
const AUTO_FALL_ZONE_DEFAULT = {
  x: AUTO_WALK_TRIGGER_X_DEFAULT + 260,
  y: GROUND_Y - 60,
  width: 220,
  height: 220,
};
/** Matches the ordinary walking pace, so auto-walk reads as the same stride continuing. */
const AUTO_WALK_SPEED_DEFAULT = WALK_SPEED;

/** Downward acceleration once FALLING starts, in world px/s². Not editor-authored: a physics constant, not a placement. */
const FALL_GRAVITY_PX_S2 = 1500;
/** Fraction of the auto-walk speed the fall keeps drifting right at, so the character lands inside the authored fall zone rather than dropping perfectly straight down or still running at full stride mid-air. */
const FALL_HORIZONTAL_RETENTION = 0.4;
/**
 * World px the player must actually fall — measured from where FALLING
 * began, not from the black bar's own boundary — before COMPLETE fires.
 *
 * `GROUND_Y` (610) already sits *below* the bottom rubble bar's own top edge
 * (`bottomMaskTopWorldY`, ~517 at the current mask height): measuring
 * completion against that boundary meant the player was already "past" it
 * the instant FALLING began, at zero elapsed fall distance — the level
 * completed on the very first FALLING frame, before any visible drop.
 * Occlusion (raising `bottomRubbleMask` above the player) still happens
 * immediately in `enterFalling`, which is correct — the mask is meant to
 * start swallowing him from ground level; only *how long the fall plays
 * before the level moves on* needed to be independent of that geometry.
 * ~0.65s at `FALL_GRAVITY_PX_S2`, long enough to read as an actual fall.
 */
const FALL_COMPLETE_DISTANCE_PX = 320;

/**
 * How much of `sprite.getBounds()` actually counts as the player for fall-zone
 * intersection — see `playerHitbox`. A character frame is mostly transparent
 * margin around the drawn body, so testing the full frame reached the zone
 * well before any visible part of the character did.
 */
const PLAYER_HITBOX_FRAC = { width: 0.4, height: 0.85 };

type Level4SequenceState = 'normal' | 'autoWalk' | 'falling' | 'complete';

interface Level4Actor {
  sprite: Phaser.GameObjects.Sprite;
  character: CharacterDefinition;
  motion: 'idle' | 'walk' | 'damage';
  x: number;
  y: number;
  facing: 1 | -1;
  currentKey?: string;
}

export interface Level4SceneData {
  rhythmResult?: RhythmResult;
  introComplete?: boolean;
  playerX?: number;
  /** World x the camera was centred on; see `Level4ResumePayload`. */
  cameraFocusX?: number;
  npcId?: string;
}

export class Level4Scene extends Phaser.Scene implements EditableScene {
  private rhythmResult: RhythmResult = createEmptyRhythmResult();
  private introComplete = false;
  private playerX = PLAYER_START_X;
  /** Live mirror of `camera.scrollX`, reasserted after bounds changes. */
  private cameraX = 0;
  /** Set only when resuming from the dialogue; see `Level4ResumePayload`. */
  private resumeCameraFocusX?: number;
  private npcId?: string;
  private playerCharacter!: CharacterDefinition;
  private npcCharacter!: CharacterDefinition;
  private player!: Level4Actor;
  private npc!: Level4Actor;
  private holyworldBackground!: Phaser.GameObjects.TileSprite;
  private toiletStrip!: Phaser.GameObjects.Image;
  private stallDoor!: Phaser.GameObjects.Image;
  private topRubbleMask!: Phaser.GameObjects.Graphics;
  private bottomRubbleMask!: Phaser.GameObjects.Graphics;
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

  // ------------------------------------------------ gap cutscene (fall)
  /** Authored trigger/camera-stop/fall-zone/speed; reloaded fresh in `create()` every entry. */
  private cutsceneConfig!: Level4CutsceneConfig;
  /** Runtime-only; reset to 'normal' in `init()` every entry — never persisted. */
  private sequenceState: Level4SequenceState = 'normal';
  private cameraLocked = false;
  /** The world x the frozen frame is centred on once `cameraLocked` is true. */
  private lockedFocusX = 0;
  private fallVelocityY = 0;
  private fallHorizontalVelocity = 0;
  /** `player.y` at the moment FALLING began; COMPLETE waits for a real drop past this, not a fixed world-y. */
  private fallStartY = 0;
  /** Thin draggable world-x lines, visible only while the editor is open. */
  private autoWalkTriggerHandle!: Phaser.GameObjects.Rectangle;
  private autoWalkTriggerLine!: Phaser.GameObjects.Rectangle;
  private autoWalkTriggerLabel!: Phaser.GameObjects.Text;
  private cameraStopHandle!: Phaser.GameObjects.Rectangle;
  private cameraStopLine!: Phaser.GameObjects.Rectangle;
  private cameraStopLabel!: Phaser.GameObjects.Text;
  private autoFallZoneRect!: Phaser.GameObjects.Rectangle;
  private autoFallZoneLabel!: Phaser.GameObjects.Text;
  /** Editor-only world ruler; see `WORLD_RULER_SPACING`. */
  private worldRuler: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Level4Scene');
  }

  init(data: Partial<Level4SceneData>): void {
    this.rhythmResult = data.rhythmResult ?? createEmptyRhythmResult();
    this.introComplete = data.introComplete === true;
    this.playerX = data.playerX ?? PLAYER_START_X;
    this.resumeCameraFocusX = data.cameraFocusX;
    this.cameraX = 0;
    this.npcId = data.npcId;
    this.controlsLocked = false;
    // Coming back from DialogueScene the conversation has already happened.
    // Without this the resumed scene would re-arm the proximity trigger and
    // walk straight back into DialogueScene, looping forever at the stall.
    this.dialogueTriggered = this.introComplete;
    this.finished = false;
    // Runtime-only: a fresh Level 4 entry always re-arms the gap cutscene.
    // Only the authored trigger/camera-stop/fall-zone/speed persist — those
    // are reloaded from the editor's own store in `create()`, not reset here.
    this.sequenceState = 'normal';
    this.cameraLocked = false;
    this.lockedFocusX = 0;
    this.fallVelocityY = 0;
    this.fallHorizontalVelocity = 0;
    this.fallStartY = 0;
  }

  preload(): void {
    this.playerCharacter = getSelectedCharacter();
    this.npcCharacter = this.npcId ? getCharacter(this.npcId) : chooseLevel4NpcCharacter(this.playerCharacter);
    queueCharacterGameplay(this, this.playerCharacter);
    queueCharacterGameplay(this, this.npcCharacter);
    const profile = getRuntimeAssetQualityProfile(this.game, this.scale);
    for (const asset of getLevel4AssetUrls(profile)) {
      if (!this.textures.exists(asset.key)) this.load.image(asset.key, asset.url);
    }
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
    this.buildGapCutscene();
    this.buildWorldRuler();

    // Same manual walk control as the Level 2 walk: arrows/A-D on desktop,
    // hold either half of the screen on touch. Below Depth.UI so the pause,
    // sound and fullscreen controls still win the pointer.
    this.walk = new WalkInput(this, { zoneDepth: Depth.UI - 5 });

    this.cameras.main.setBounds(0, 0, LEVEL4_WORLD_WIDTH, DESIGN_HEIGHT);
    this.cameras.main.startFollow(this.player.sprite, true, 0.08, 0.08, -220, 0);
    // Resuming centres the same world point the conversation interrupted,
    // through the same framing rule the cutscene lock uses, rather than
    // replaying a scroll measured on whatever viewport was open then.
    if (this.resumeCameraFocusX !== undefined) {
      this.cameraX = resolveCameraStopScroll(
        this.resumeCameraFocusX,
        this.cameras.main.width,
        LEVEL4_WORLD_WIDTH,
      );
    }
    this.cameras.main.setScroll(this.cameraX, 0);

    new OrientationController(this, {
      onLayout: (viewport) => this.applyResponsiveLayout(viewport),
    });
    this.applyResponsiveLayout();

    if (this.introComplete) {
      this.player.x = this.playerX;
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
    const textureSource = this.textures
      .get(LEVEL4_ASSET_KEYS.holyworldBackground)
      .getSourceImage() as { height?: number };
    const tileScale = DESIGN_HEIGHT / (textureSource.height ?? HOLYWORLD_BG_HEIGHT);
    const width = LEVEL4_WORLD_WIDTH - DISSOLVE_START_X;
    this.holyworldBackground = this.add
      .tileSprite(DISSOLVE_START_X, 0, width, DESIGN_HEIGHT, LEVEL4_ASSET_KEYS.holyworldBackground)
      .setOrigin(0, 0)
      .setTileScale(tileScale, tileScale)
      .setDepth(Depth.SKY);
  }

  /**
   * Extends the room's own near-black tone a stride further into Holyworld
   * than the wall's alpha alone reaches — two flat horizontal bars, top and
   * bottom, continuing the ceiling/floor tone rather than Holyworld already
   * at full height the instant a hole opens.
   *
   * Sits between the background (`Depth.SKY`) and the toilet strip
   * (`Depth.ENVIRONMENT + 5`): the strip's own crumbling alpha is still the
   * only thing that makes any of this visible, this only changes what the
   * strip's holes reveal for a while. Drawn once against the level's fixed
   * geometry (not the viewport), so it holds up at every camera size the same
   * way the toilet strip itself does.
   */
  private buildRubbleMask(): void {
    // Two plain bars, top and bottom, continuing the room's own dark tone
    // over Holyworld for the rest of the level rather than stopping partway
    // across it — a flat overhang, not a shaped silhouette. Starts
    // `RUBBLE_MASK_SEAM_PX` before the wall's own crumbling so it meets the
    // toilet strip's dark ceiling/floor with no sliver of Holyworld showing
    // at the seam, and runs to the level's own right edge rather than a fixed
    // span, so nothing after it is left uncovered regardless of level width.
    //
    // Two separate Graphics objects, not one draw call, so the bottom bar's
    // depth can be raised above the player the moment the gap cutscene's
    // FALLING state begins (see `enterFalling`) without touching the top
    // bar, which never needs to occlude anything.
    const left = DISSOLVE_START_X - RUBBLE_MASK_SEAM_PX;
    const width = LEVEL4_WORLD_WIDTH - left;
    const height = RUBBLE_MASK_HEIGHT_FRAC * DESIGN_HEIGHT + RUBBLE_MASK_SEAM_PX;
    const toneColor = 0x0a0612; // matches the camera's own clear colour
    this.topRubbleMask = this.add.graphics().setDepth(Depth.SKY + 1);
    this.topRubbleMask.fillStyle(toneColor, 1);
    this.topRubbleMask.fillRect(left, 0, width, height);
    this.bottomRubbleMask = this.add.graphics().setDepth(Depth.SKY + 1);
    this.bottomRubbleMask.fillStyle(toneColor, 1);
    this.bottomRubbleMask.fillRect(left, DESIGN_HEIGHT - height, width, height);
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

  /**
   * Loads the toilet-to-Holyworld gap cutscene's authored config and builds
   * its three editor-only markers.
   *
   * `autoWalkTriggerHandle`/`cameraStopHandle` are the actual `EditableObject`
   * targets the shared `SceneEditor` drags — thin, invisible, full-height
   * rectangles whose `x` is the only coordinate that means anything, the same
   * "invisible interactive rect plus a separate always-visible companion"
   * split `stallEntryTargetRect`'s own P/N markers already use above, so the
   * shared editor's own selection outline never has to double up with a
   * second filled box drawn on top of it. `autoFallZoneRect` needs no such
   * split — like `stallEntryTargetRect`, its own outline and handles already
   * are the visual, so it only gets a text label.
   */
  private buildGapCutscene(): void {
    this.cutsceneConfig = resolveLevel4CutsceneConfig(this.scene.key, {
      cameraStopFocusX: CAMERA_STOP_FOCUS_X_DEFAULT,
      autoWalkTriggerX: AUTO_WALK_TRIGGER_X_DEFAULT,
      autoFallZone: AUTO_FALL_ZONE_DEFAULT,
      autoWalkSpeed: AUTO_WALK_SPEED_DEFAULT,
    });

    const lineWidth = 4;
    this.autoWalkTriggerHandle = this.add
      .rectangle(this.cutsceneConfig.autoWalkTriggerX, DESIGN_HEIGHT / 2, lineWidth, DESIGN_HEIGHT, 0x000000, 0)
      .setDepth(Depth.FOREGROUND + 20)
      .setVisible(false);
    this.autoWalkTriggerLine = this.add
      .rectangle(0, DESIGN_HEIGHT / 2, lineWidth, DESIGN_HEIGHT, 0x7ef0ff, 0.6)
      .setDepth(Depth.FOREGROUND + 21)
      .setVisible(false);
    this.autoWalkTriggerLabel = this.add
      .text(0, 8, 'AUTO WALK', TARGET_LABEL_STYLE)
      .setOrigin(0.5, 0)
      .setDepth(Depth.FOREGROUND + 21)
      .setVisible(false);

    this.cameraStopHandle = this.add
      .rectangle(this.cutsceneConfig.cameraStopFocusX, DESIGN_HEIGHT / 2, lineWidth, DESIGN_HEIGHT, 0x000000, 0)
      .setDepth(Depth.FOREGROUND + 20)
      .setVisible(false);
    this.cameraStopLine = this.add
      .rectangle(0, DESIGN_HEIGHT / 2, lineWidth, DESIGN_HEIGHT, 0xffe36d, 0.6)
      .setDepth(Depth.FOREGROUND + 21)
      .setVisible(false);
    this.cameraStopLabel = this.add
      .text(0, 8, 'CAMERA STOP', TARGET_LABEL_STYLE)
      .setOrigin(0.5, 0)
      .setDepth(Depth.FOREGROUND + 21)
      .setVisible(false);

    const zone = this.cutsceneConfig.autoFallZone;
    // 1x1 rect scaled to width/height, same convention as `stallEntryTargetRect`:
    // `getNativeSize` reports {1, 1} so the editor's scaleX/scaleY resize
    // reads directly as the zone's pixel size.
    this.autoFallZoneRect = this.add
      .rectangle(zone.x, zone.y, 1, 1, 0x000000, 0)
      .setScale(zone.width, zone.height)
      .setDepth(Depth.FOREGROUND + 20)
      .setVisible(false);
    this.autoFallZoneLabel = this.add
      .text(0, 0, 'AUTO FALL', TARGET_LABEL_STYLE)
      .setOrigin(0.5, 0.5)
      .setDepth(Depth.FOREGROUND + 21)
      .setVisible(false);

    this.layoutGapCutsceneMarkers();
  }

  /**
   * A labelled line every `WORLD_RULER_SPACING` world px, from the level's
   * left edge to its right one.
   *
   * Built from the level's own width, not the camera's, so it covers the
   * whole world rather than one screen of it, and it is drawn exactly like
   * the room: at a world x, with no scroll factor and no offset. That is the
   * point — it is a direct read-out of the coordinate system every other
   * world object in this scene uses.
   */
  private buildWorldRuler(): void {
    for (let x = 0; x <= LEVEL4_WORLD_WIDTH; x += WORLD_RULER_SPACING) {
      const line = this.add
        .rectangle(x, DESIGN_HEIGHT / 2, 1, DESIGN_HEIGHT, 0x4be3a1, 0.35)
        .setDepth(Depth.FOREGROUND + 19)
        .setVisible(false);
      const label = this.add
        .text(x, DESIGN_HEIGHT - 8, `x ${x}`, TARGET_LABEL_STYLE)
        .setOrigin(0.5, 1)
        .setDepth(Depth.FOREGROUND + 19)
        .setVisible(false);
      this.worldRuler.push(line, label);
    }
  }

  /** Repositions the visible line/label companions onto the handles' current bounds. */
  private layoutGapCutsceneMarkers(): void {
    const triggerX = this.autoWalkTriggerHandle.x;
    this.autoWalkTriggerLine.setPosition(triggerX, DESIGN_HEIGHT / 2);
    this.autoWalkTriggerLabel.setPosition(triggerX, 8);

    const cameraStopX = this.cameraStopHandle.x;
    this.cameraStopLine.setPosition(cameraStopX, DESIGN_HEIGHT / 2);
    this.cameraStopLabel.setPosition(cameraStopX, 8);

    const zone = this.autoFallZoneRect;
    this.autoFallZoneLabel.setPosition(zone.x, zone.y);
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
    return getPlayerVisualOffset(this.scene.key);
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
      {
        id: LEVEL4_EDITABLE_IDS.autoWalkTrigger,
        label: 'AUTO WALK',
        target: this.autoWalkTriggerHandle,
        getNativeSize: () => ({ width: 1, height: 1 }),
        // A vertical line, not a box: only its x is ever read, so there is
        // nothing here to resize.
        resizable: false,
        onChange: (transform) => {
          // Keeps it a full-height vertical line regardless of an accidental
          // vertical drag — only x is ever authored for this marker.
          this.autoWalkTriggerHandle.setPosition(transform.x, DESIGN_HEIGHT / 2);
          storeLevel4Placement(
            this.scene.key,
            LEVEL4_EDITABLE_IDS.autoWalkTrigger,
            { x: transform.x, y: 0, scaleX: 1, scaleY: 1 },
          );
          this.cutsceneConfig.autoWalkTriggerX = transform.x;
          this.layoutGapCutsceneMarkers();
        },
      },
      {
        id: LEVEL4_EDITABLE_IDS.cameraStop,
        label: 'CAMERA STOP',
        target: this.cameraStopHandle,
        getNativeSize: () => ({ width: 1, height: 1 }),
        resizable: false,
        onChange: (transform) => {
          this.cameraStopHandle.setPosition(transform.x, DESIGN_HEIGHT / 2);
          storeLevel4Placement(
            this.scene.key,
            LEVEL4_EDITABLE_IDS.cameraStop,
            { x: transform.x, y: 0, scaleX: 1, scaleY: 1 },
          );
          this.cutsceneConfig.cameraStopFocusX = transform.x;
          this.layoutGapCutsceneMarkers();
        },
      },
      {
        id: LEVEL4_EDITABLE_IDS.autoFallZone,
        label: 'AUTO FALL',
        target: this.autoFallZoneRect,
        getNativeSize: () => ({ width: 1, height: 1 }),
        allowNonUniformScale: true,
        onChange: (transform) => {
          storeLevel4Placement(
            this.scene.key,
            LEVEL4_EDITABLE_IDS.autoFallZone,
            {
              x: transform.x,
              y: transform.y,
              scaleX: transform.scaleX,
              scaleY: transform.scaleY,
            },
          );
          this.cutsceneConfig.autoFallZone = {
            x: transform.x,
            y: transform.y,
            width: transform.scaleX,
            height: transform.scaleY,
          };
          this.layoutGapCutsceneMarkers();
        },
      },
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
    // The gap cutscene's three markers are equally noise during normal play
    // — and `updateGapSequence` itself checks `isSceneEditorActive`, so the
    // sequence is already frozen the instant the editor opens regardless of
    // which state it was in.
    this.autoWalkTriggerLine.setVisible(true);
    this.autoWalkTriggerLabel.setVisible(true);
    this.cameraStopLine.setVisible(true);
    this.cameraStopLabel.setVisible(true);
    this.autoFallZoneRect.setVisible(true);
    this.autoFallZoneLabel.setVisible(true);
    for (const part of this.worldRuler) (part as Phaser.GameObjects.Image).setVisible(true);
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
    this.autoWalkTriggerLine.setVisible(false);
    this.autoWalkTriggerLabel.setVisible(false);
    this.cameraStopLine.setVisible(false);
    this.cameraStopLabel.setVisible(false);
    this.autoFallZoneRect.setVisible(false);
    this.autoFallZoneLabel.setVisible(false);
    for (const part of this.worldRuler) (part as Phaser.GameObjects.Image).setVisible(false);
  }

  /**
   * Read-only HUD lines: `autoWalkSpeed`, which has no world-space handle of
   * its own, and what the CAMERA STOP line actually means — it marks the
   * world x the locked shot is *centred* on, not where the frame's left edge
   * lands, which is what keeps the same composition on every screen width.
   */
  describeEditor(): string[] {
    return [
      `autoWalkSpeed ${this.cutsceneConfig.autoWalkSpeed.toFixed(0)} px/s (edit sceneLayout.json to change)`,
      'CAMERA STOP = world x the locked shot centres on',
      `world ruler every ${WORLD_RULER_SPACING}px — same mark must meet the same tile on every device`,
    ];
  }

  private applyResponsiveLayout(viewport?: ViewportInfo): void {
    const camera = this.cameras.main;
    // Once the gap cutscene has locked the camera, its own scroll — not the
    // ordinary follow-derived `cameraX` — is the only thing a resize is
    // allowed to reassert; recomputing `cameraX` from the current (frozen)
    // scroll and writing it straight back would be a no-op today, but would
    // silently start fighting the lock the moment anything else in this
    // method's ordering changed.
    if (!this.cameraLocked) {
      this.cameraX = Phaser.Math.Clamp(this.cameraX, 0, Math.max(0, LEVEL4_WORLD_WIDTH - camera.width));
    }
    this.walk.layout(camera.width, camera.height);
    this.syncActor(this.player, this.time.now);
    this.syncActor(this.npc, this.time.now);
    if (viewport) {
      // Keep the composition consistent after resize; the actual gameplay
      // geometry remains world-space and untouched.
      this.cameras.main.setBounds(0, 0, LEVEL4_WORLD_WIDTH, DESIGN_HEIGHT);
    }
    // `setBounds` above can itself re-clamp scroll against the new bounds, so
    // the lock is reasserted after it rather than before — otherwise a
    // narrower viewport could nudge the "static" shot mid-fall.
    this.cameras.main.setScroll(this.cameraLocked ? this.lockedScrollX() : this.cameraX, 0);
  }

  update(_time: number, delta: number): void {
    if (this.finished) return;
    const now = this.time.now;

    if (this.sequenceState !== 'normal') {
      this.updateGapSequence(delta);
      this.syncActor(this.player, now);
      this.syncActor(this.npc, now);
      this.cameraX = this.cameras.main.scrollX;
      return;
    }

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

      // Checked before the dialogue/finish triggers below: past this point
      // control belongs to the scripted sequence, exactly once, for the rest
      // of the level.
      if (this.player.x >= this.cutsceneConfig.autoWalkTriggerX) {
        this.enterAutoWalk();
        this.syncActor(this.player, now);
        this.syncActor(this.npc, now);
        this.cameraX = this.cameras.main.scrollX;
        return;
      }

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

  // ------------------------------------------------- gap cutscene (fall)

  /**
   * NORMAL -> AUTO_WALK. Reuses `controlsLocked` — the exact flag that
   * already gates keyboard/touch direction, the dialogue trigger and the
   * ordinary finish trigger above — so none of those can race a held
   * direction key against the scripted velocity or fire a heartbeat after
   * this point; they are simply never evaluated again this run.
   */
  private enterAutoWalk(): void {
    if (this.sequenceState !== 'normal') return; // run-once
    this.sequenceState = 'autoWalk';
    this.controlsLocked = true;
    this.player.facing = 1;
    this.player.motion = 'walk';
    // Covers the (legitimate) case where the focus point sits behind wherever
    // the camera's own follow lerp has already carried it.
    this.maybeLockCamera();
  }

  /** Advances AUTO_WALK/FALLING by one frame. Frozen while the editor is open, exactly like the stall sequence's tweens. */
  private updateGapSequence(delta: number): void {
    if (isSceneEditorActive(this)) return;
    if (this.sequenceState === 'autoWalk') {
      this.player.x += (this.cutsceneConfig.autoWalkSpeed * delta) / 1000;
      this.player.facing = 1;
      this.player.motion = 'walk';
      this.maybeLockCamera();
      if (this.playerIntersectsFallZone()) this.enterFalling();
    } else if (this.sequenceState === 'falling') {
      this.fallVelocityY += (FALL_GRAVITY_PX_S2 * delta) / 1000;
      this.player.y += (this.fallVelocityY * delta) / 1000;
      this.player.x += (this.fallHorizontalVelocity * delta) / 1000;
      if (this.player.y >= this.fallStartY + FALL_COMPLETE_DISTANCE_PX) {
        this.enterComplete();
      }
    }
  }

  /** Locks once the camera's own follow has carried the frame's centre onto the authored focus point. */
  private maybeLockCamera(): void {
    if (this.cameraLocked) return;
    const camera = this.cameras.main;
    if (camera.scrollX + camera.width / 2 >= this.cutsceneConfig.cameraStopFocusX) {
      this.lockCamera(this.cutsceneConfig.cameraStopFocusX);
    }
  }

  /**
   * Stops following the player and freezes the frame on `focusX`, permanently
   * for the rest of this run — `applyResponsiveLayout` re-asserts the lock on
   * every resize once this is set, and nothing else in this scene ever calls
   * `setScroll`/`startFollow` again after it. This is the one and only place
   * that happens, so there is nowhere else a stray follow-restoration could
   * sneak back in.
   *
   * What is remembered is the *focus point*, not the scroll it works out to:
   * the scroll depends on how wide the camera currently is, so a resize (or a
   * device with a different aspect ratio) has to re-derive it to keep the
   * same world detail in the middle of the shot.
   */
  private lockCamera(focusX: number): void {
    if (this.cameraLocked) return;
    this.cameraLocked = true;
    this.lockedFocusX = focusX;
    this.cameras.main.stopFollow();
    this.cameras.main.setScroll(this.lockedScrollX(), 0);
  }

  /**
   * The scroll that centres `lockedFocusX`, clamped to the level's own
   * bounds. Recomputed rather than stored, so the locked shot survives a
   * resize or an orientation change with the same world point centred.
   */
  private lockedScrollX(): number {
    return resolveCameraStopScroll(this.lockedFocusX, this.cameras.main.width, LEVEL4_WORLD_WIDTH);
  }

  /**
   * The player's actual rendered hitbox (see `playerHitbox`) against the
   * authored zone — not just `actor.x`/the sprite origin — so differently
   * sized characters all trigger the fall at the same physical overlap
   * rather than whichever one's origin happens to sit further from its own
   * edges.
   */
  private playerIntersectsFallZone(): boolean {
    const zone = this.cutsceneConfig.autoFallZone;
    const zoneRect = new Phaser.Geom.Rectangle(
      zone.x - zone.width / 2,
      zone.y - zone.height / 2,
      zone.width,
      zone.height,
    );
    return Phaser.Geom.Intersects.RectangleToRectangle(this.playerHitbox(), zoneRect);
  }

  /**
   * The player's actual bounding box (`sprite.getBounds()`), shrunk toward
   * its own centre by `PLAYER_HITBOX_FRAC`.
   *
   * Every character's artwork is a full frame with a lot of transparent
   * margin around the drawn body (Atmos's idle frame is 195px wide but only
   * ~70px of that is opaque, roughly centred) — `getBounds()` reports the
   * whole frame, so using it directly made the leading edge of that margin
   * reach the fall zone well before any visible part of the character did,
   * i.e. she started falling before she looked like she had reached it. This
   * is a fixed *fraction* of whatever `getBounds()` reports, never a pixel
   * measurement of one character's artwork, so it holds for every playable
   * character's own frame size without naming one.
   */
  private playerHitbox(): Phaser.Geom.Rectangle {
    const bounds = this.player.sprite.getBounds();
    const width = bounds.width * PLAYER_HITBOX_FRAC.width;
    const height = bounds.height * PLAYER_HITBOX_FRAC.height;
    return new Phaser.Geom.Rectangle(
      bounds.centerX - width / 2,
      bounds.centerY - height / 2,
      width,
      height,
    );
  }

  /**
   * AUTO_WALK -> FALLING. The camera is force-locked here regardless of
   * whether it had already reached the authored focus under its own follow, so
   * the shot is guaranteed static for the entire fall even if the fall zone
   * is authored close enough to the trigger that the follow lerp never
   * caught up in time.
   */
  private enterFalling(): void {
    if (this.sequenceState !== 'autoWalk') return; // run-once
    this.sequenceState = 'falling';
    if (!this.cameraLocked) this.lockCamera(this.cutsceneConfig.cameraStopFocusX);
    this.fallVelocityY = 0;
    this.fallHorizontalVelocity = this.cutsceneConfig.autoWalkSpeed * FALL_HORIZONTAL_RETENTION;
    this.fallStartY = this.player.y;
    // The existing damage pose, resolved through the same
    // CharacterRegistry-backed locomotion module every other pose in this
    // scene already goes through — nothing here names a character, and every
    // playable character is guaranteed at least one damage frame (it gates
    // `capabilities.playable`).
    this.player.motion = 'damage';
    // From this point the lower black bar has to render in front of the
    // player, not behind him, so the fall reads as passing behind it rather
    // than the sprite just stopping in front of a wall of black.
    this.bottomRubbleMask.setDepth(Depth.PLAYER + 1);
  }

  /**
   * FALLING -> COMPLETE. By now the player has been occluded by
   * `bottomRubbleMask` (raised above him in `enterFalling`) for a while —
   * this only stops rendering him once he is well past that line, so the
   * `setVisible(false)` is cleanup after the fact, not what makes him
   * disappear. Hands off to whatever Level 4 already does at the end of a
   * normal run, exactly as if the ordinary finish threshold had fired.
   */
  private enterComplete(): void {
    if (this.sequenceState !== 'falling') return; // run-once
    this.sequenceState = 'complete';
    this.player.sprite.setVisible(false);
    this.finishLevel();
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
      cameraFocusX: this.cameras.main.scrollX + this.cameras.main.width / 2,
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
   *
   * This is the one place in Level 4 where the camera legitimately feeds a
   * world position, and it is worth being explicit about why: nothing is
   * being *placed* here. The NPC's authored position, the stall, the door and
   * every trigger are fixed world coordinates; this is a transient "walk
   * until you are out of frame" whose only meaning is visibility, and how
   * much is in frame is exactly what the camera decides. It leaves nothing
   * behind — no authored value, no state that outlives the tween.
   *
   * The *pace*, however, must not depend on the screen: a wider frame means a
   * longer walk, and holding the duration fixed made the same character stride
   * measurably faster on a phone. The duration is derived from the distance
   * instead, so the exit reads identically everywhere and only takes as long
   * as the extra ground needs.
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
    const distance = Math.abs(this.npc.x - exitX);
    this.tweens.add({
      targets: this.npc,
      x: exitX,
      duration: Math.max(1, (distance / NPC_EXIT_SPEED) * 1000),
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

  /**
   * The world x the ordinary (non-cutscene) walk ends at.
   *
   * Fixed world geometry, expressed against the canonical design width the
   * level itself is built from — not `camera.width`, which made how far the
   * character was allowed to walk depend on the browser window, so a
   * landscape phone let them walk ~140px further into the level than a
   * desktop did before the level completed.
   */
  private finishThreshold(): number {
    return TOILET_RIGHT_EDGE_X + DESIGN_WIDTH / 2 + 16;
  }

  private cleanup(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.walk?.destroy();
    this.holyworldBackground?.destroy();
    this.topRubbleMask?.destroy();
    this.bottomRubbleMask?.destroy();
    this.toiletStrip?.destroy();
    this.stallDoor?.destroy();
    this.player?.sprite.destroy();
    this.npc?.sprite.destroy();
    for (const part of this.worldRuler) part.destroy();
    this.worldRuler = [];
  }
}
