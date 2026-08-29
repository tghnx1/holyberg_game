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

// Native pixel dimensions of assets/level_4/toilet-full.png. The artwork is
// authored as a short wide strip (floor-to-ceiling height, full room width)
// with a crumbling/transparent right edge that is meant to reveal Holyworld
// behind it as the player walks through it.
const TOILET_STRIP_WIDTH = TOILET_STRIP_NATIVE_WIDTH;
const TOILET_STRIP_HEIGHT = TOILET_STRIP_NATIVE_HEIGHT;

// Native pixel height of assets/level_4/holyworld-background.png.
const HOLYWORLD_BG_HEIGHT = 940;

/**
 * How tall the authored room is drawn, as a fraction of the logical viewport.
 *
 * The strip is only 175px tall for a whole floor-to-ceiling bathroom, so
 * stretching it to fill 720px made the room about five character-heights tall
 * — urinals as tall as the player. Characters are drawn at the same shared
 * `gameplayScale` as Berlin (0.8, ~147px), and that size is fixed, so the room
 * has to come to them: at this ratio it stands ~448px, about three character
 * heights, matching the character-to-room proportion Dialogue 1's metro panel
 * already uses.
 *
 * The artwork itself is never stretched — only uniformly scaled — so the strip
 * cannot fill the frame at an honest proportion. `buildRoomBands` fills what is
 * left above and below with tones taken from the artwork's own edges.
 */
const TOILET_HEIGHT_RATIO = 448 / 720;
const TOILET_SCALE = (DESIGN_HEIGHT * TOILET_HEIGHT_RATIO) / TOILET_STRIP_HEIGHT;

/**
 * Native row the characters stand on: the floor the stall bases sit on, which
 * is also the door opening's bottom edge, so actors and door share one floor.
 */
const TOILET_FLOOR_NATIVE_Y = 147;
/** World y of the artwork's top edge, placing that floor row on GROUND_Y. */
const TOILET_TOP_Y = GROUND_Y - TOILET_FLOOR_NATIVE_Y * TOILET_SCALE;
const TOILET_BOTTOM_Y = TOILET_TOP_Y + TOILET_STRIP_HEIGHT * TOILET_SCALE;

// Native-pixel x where the artwork starts crumbling away to transparency
// (measured against toilet-full.png), scaled into world space.
const DISSOLVE_START_X_NATIVE = 1150;
const DISSOLVE_START_X = DISSOLVE_START_X_NATIVE * TOILET_SCALE;

// The one stall in the artwork drawn without a door — an open frame with a
// visible toilet bowl — is the portal stall. Its opening was measured off
// toilet-full.png in native pixels; everything the cutscene positions is
// derived from that rect so the door and the actors cannot drift apart.
const STALL_OPENING_LEFT = 665 * TOILET_SCALE;
const STALL_OPENING_RIGHT = 700 * TOILET_SCALE;
const STALL_OPENING_TOP = TOILET_TOP_Y + 50 * TOILET_SCALE;
// The opening's floor row is the row the actors stand on, so this is GROUND_Y.
const STALL_OPENING_BOTTOM = TOILET_TOP_Y + TOILET_FLOOR_NATIVE_Y * TOILET_SCALE;
const STALL_OPENING_WIDTH = STALL_OPENING_RIGHT - STALL_OPENING_LEFT;
const STALL_OPENING_HEIGHT = STALL_OPENING_BOTTOM - STALL_OPENING_TOP;

/**
 * How wide the door is drawn while open, as a fraction of its closed width.
 * The door is hinged on the opening's right edge and only ever narrows toward
 * that hinge — it never rotates and never moves — so an open door reads as a
 * leaf turned edge-on inside the frame rather than one lying on the floor.
 */
const DOOR_OPEN_SCALE = 0.12;

// Walkway positions, in the same native pixel space as the stall rect.
const PLAYER_START_X = 160 * TOILET_SCALE;
const PLAYER_MIN_X = 40 * TOILET_SCALE;
const NPC_WAIT_X = 645 * TOILET_SCALE;
const PLAYER_ENTER_X = 672 * TOILET_SCALE;
const NPC_ENTER_X = 690 * TOILET_SCALE;
const NPC_EXIT_X = 555 * TOILET_SCALE;
/** How close to the waiting NPC the player must walk for them to speak up. */
const DIALOGUE_PROXIMITY = 55 * TOILET_SCALE;

const LEVEL4_WORLD_WIDTH = TOILET_STRIP_WIDTH * TOILET_SCALE + DESIGN_WIDTH;
const NPC_WAIT_FACING: 1 | -1 = -1;

/** Same hue, `factor` of the brightness. */
function darken(color: number, factor: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(
    Math.round(c.red * factor),
    Math.round(c.green * factor),
    Math.round(c.blue * factor),
  );
}

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

export class Level4Scene extends Phaser.Scene {
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
  private roomBands!: Phaser.GameObjects.Graphics;
  private ceilingTone = 0x0a0612;
  private floorTone = 0x0a0612;
  private stallDoor!: Phaser.GameObjects.Image;
  private walk!: WalkInput;
  /** The door's scaleX when shut, derived from the measured stall opening. */
  private doorClosedScaleX = 1;
  /** True only while the dialogue hand-off and the stall cutscene are running. */
  private controlsLocked = false;
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
    this.buildToiletStrip();
    this.buildRoomBands();
    this.buildActors();
    this.buildDoor();

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

  private buildToiletStrip(): void {
    this.toiletStrip = this.add
      .image(0, TOILET_TOP_Y, LEVEL4_ASSET_KEYS.toiletStrip)
      .setOrigin(0, 0)
      // Uniform: the artwork's aspect ratio is never distorted to fit the frame.
      // Divided by the texture's own upscale so TOILET_SCALE stays expressed in
      // authored pixels and the world geometry below is unaffected by it.
      .setScale(TOILET_SCALE / TOILET_TEXTURE_UPSCALE)
      .setDepth(Depth.ENVIRONMENT + 5);
  }

  /**
   * Fills the frame above and below the authored strip so the toilet reads as
   * a whole room rather than a band floating in the void.
   *
   * The tones are sampled from the artwork's own top and bottom rows, so this
   * is the room's existing wall and floor continuing, not new art — and it
   * fades out across the same span where the artwork itself crumbles away, so
   * the Holyworld reveal is never boxed in by a hard edge.
   */
  private buildRoomBands(): void {
    // Sampled once: reading pixels back from a texture is not something to
    // repeat on every orientation change.
    this.ceilingTone = this.sampleStripRow(2);
    this.floorTone = this.sampleStripRow(TOILET_STRIP_HEIGHT - 3);
    this.roomBands = this.add.graphics().setDepth(Depth.ENVIRONMENT + 4);
    this.layoutRoomBands();
  }

  /**
   * Redrawn from the live camera height rather than the design height, so a
   * viewport shorter or taller than 720 still has the floor band reach the
   * bottom of the frame instead of stopping short or overrunning.
   */
  private layoutRoomBands(): void {
    const ceiling = this.ceilingTone;
    const floor = this.floorTone;
    const toiletWidth = TOILET_STRIP_WIDTH * TOILET_SCALE;
    const viewportHeight = Math.max(DESIGN_HEIGHT, this.cameras.main.height);
    this.roomBands.clear();
    /**
     * `near` is the tone where the band meets the artwork; `far` is where it
     * runs off the top or bottom of the frame. Shading between them reads as
     * the room's own wall carrying on into the dark rather than as a flat bar,
     * and each band fades out horizontally across the same span where the
     * artwork crumbles, so the Holyworld reveal is never boxed in.
     */
    const band = (near: number, y: number, height: number, nearAtTop: boolean): void => {
      if (height <= 0) return;
      const far = darken(near, 0.42);
      const top = nearAtTop ? near : far;
      const bottom = nearAtTop ? far : near;
      this.roomBands.fillGradientStyle(top, top, bottom, bottom, 1, 1, 1, 1);
      this.roomBands.fillRect(0, y, DISSOLVE_START_X, height);
      this.roomBands.fillGradientStyle(top, top, bottom, bottom, 1, 0, 1, 0);
      this.roomBands.fillRect(DISSOLVE_START_X, y, toiletWidth - DISSOLVE_START_X, height);
    };
    // Above the room the wall recedes upward; below it the floor runs toward
    // the camera, so each band keeps the artwork's own tone at the shared edge.
    band(ceiling, 0, TOILET_TOP_Y, false);
    band(floor, TOILET_BOTTOM_Y, viewportHeight - TOILET_BOTTOM_Y, true);
  }

  /** Average colour of one native row of the strip, across its intact span. */
  private sampleStripRow(nativeY: number): number {
    const key = LEVEL4_ASSET_KEYS.toiletStrip;
    let r = 0;
    let g = 0;
    let b = 0;
    let taken = 0;
    for (let i = 1; i <= 8; i += 1) {
      // Sampled only from the solid left-hand span; the right edge is the
      // transparent crumble and would wash the average out.
      const x = Math.round((DISSOLVE_START_X_NATIVE * i) / 9);
      const pixel = this.textures.getPixel(
        x * TOILET_TEXTURE_UPSCALE,
        nativeY * TOILET_TEXTURE_UPSCALE,
        key,
      );
      if (!pixel) continue;
      r += pixel.red;
      g += pixel.green;
      b += pixel.blue;
      taken += 1;
    }
    if (taken === 0) return 0x0a0612;
    return Phaser.Display.Color.GetColor(
      Math.round(r / taken),
      Math.round(g / taken),
      Math.round(b / taken),
    );
  }

  private buildActors(): void {
    this.player = this.createActor(this.playerCharacter, this.playerX, GROUND_Y, 1, 'idle');
    this.npc = this.createActor(this.npcCharacter, NPC_WAIT_X, GROUND_Y, NPC_WAIT_FACING, 'idle');
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
    this.stallDoor.setDisplaySize(STALL_OPENING_WIDTH, STALL_OPENING_HEIGHT);
    this.doorClosedScaleX = this.stallDoor.scaleX;
    this.stallDoor.scaleX = this.doorClosedScaleX * DOOR_OPEN_SCALE;
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
    const scale = resolveGameplayScale(
      actor.character,
      resolveLocomotionPose(actor.character, actor.motion),
    );
    if (frame.key !== actor.currentKey) {
      actor.sprite.setTexture(frame.key);
      actor.currentKey = frame.key;
    }
    actor.sprite
      .setFlipX(actor.facing < 0)
      .setScale(scale)
      .setPosition(actor.x, actor.y + footOffset(frame.footGap, scale) + 10);
  }

  private applyResponsiveLayout(viewport?: ViewportInfo): void {
    const camera = this.cameras.main;
    this.cameraX = Phaser.Math.Clamp(this.cameraX, 0, Math.max(0, LEVEL4_WORLD_WIDTH - camera.width));
    this.walk.layout(camera.width, camera.height);
    this.layoutRoomBands();
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

    if (!this.controlsLocked) {
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

      if (!this.dialogueTriggered && this.player.x >= NPC_WAIT_X - DIALOGUE_PROXIMITY) {
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

  private startPostDialogueCutscene(): void {
    this.controlsLocked = true;
    this.player.motion = 'walk';
    this.npc.motion = 'walk';
    this.npc.facing = 1;
    this.player.facing = 1;

    let arrivals = 0;
    const onArrived = (): void => {
      arrivals += 1;
      if (arrivals < 2) return;
      this.stepIntoStall();
    };

    this.tweens.add({
      targets: this.player,
      x: PLAYER_ENTER_X,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: onArrived,
    });
    this.tweens.add({
      targets: this.npc,
      x: NPC_ENTER_X,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: onArrived,
    });
  }

  /**
   * Both are standing in the opening: fade them into the unlit stall so the
   * door shuts on an empty frame rather than across two visible characters.
   */
  private stepIntoStall(): void {
    this.player.motion = 'idle';
    this.npc.motion = 'idle';
    this.tweens.add({
      targets: [this.player.sprite, this.npc.sprite],
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeIn',
      onComplete: () => this.closeDoorThenWait(),
    });
  }

  private closeDoorThenWait(): void {
    // Only the door's width animates. Its position and its upright pose are
    // fixed to the stall opening, so it cannot swing onto the floor or drift
    // toward whoever is standing next to it.
    this.tweens.add({
      targets: this.stallDoor,
      scaleX: this.doorClosedScaleX,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => {
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
      onComplete: () => this.walkNpcOut(),
    });
  }

  private walkNpcOut(): void {
    // Both step back out of the stall; only the NPC leaves.
    this.player.sprite.setAlpha(1);
    this.npc.sprite.setAlpha(1);
    this.npc.facing = -1;
    this.npc.motion = 'walk';
    this.tweens.add({
      targets: this.npc,
      x: NPC_EXIT_X,
      duration: 720,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.npc.motion = 'idle';
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
    this.toiletStrip?.destroy();
    this.roomBands?.destroy();
    this.stallDoor?.destroy();
    this.player?.sprite.destroy();
    this.npc?.sprite.destroy();
  }
}
