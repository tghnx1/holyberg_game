import Phaser from 'phaser';
import {
  Depth,
  DESIGN_HEIGHT,
  GROUND_Y,
  RUN_SPEED,
} from '../constants';
import { queueCharacterGameplay } from '../characters/characterAssets';
import { footOffset, loopedFrameIndex, RUN_CYCLE_MS, staticRunFrameIndex } from '../characters/characterAnimation';
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
import { getLevel4AssetUrls, LEVEL4_ASSET_KEYS } from '../level/level4/level4Assets';
import { computeCoverFit } from '../dialogue/dialogueLayoutMetrics';

const LEVEL4_WORLD_WIDTH = 2600;
const TOILET_STRIP_HEIGHT = 175;
const TOILET_STRIP_WIDTH = 1532;
const DIALOGUE_TRIGGER_X = 1020;
const NPC_STALL_X = 1124;
const PLAYER_STALL_X = 1078;
const NPC_EXIT_X = 940;
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

export class Level4Scene extends Phaser.Scene {
  private rhythmResult: RhythmResult = createEmptyRhythmResult();
  private introComplete = false;
  private playerX = 160;
  private cameraX = 0;
  private npcId?: string;
  private playerCharacter!: CharacterDefinition;
  private npcCharacter!: CharacterDefinition;
  private player!: Level4Actor;
  private npc!: Level4Actor;
  private holyworldBackground!: Phaser.GameObjects.Image;
  private toiletStrip!: Phaser.GameObjects.Image;
  private stallDoor!: Phaser.GameObjects.Image;
  private running = false;
  private cutscenePlaying = false;
  private dialogueTriggered = false;
  private finished = false;

  constructor() {
    super('Level4Scene');
  }

  init(data: Partial<Level4SceneData>): void {
    this.rhythmResult = data.rhythmResult ?? createEmptyRhythmResult();
    this.introComplete = data.introComplete === true;
    this.playerX = data.playerX ?? 160;
    this.cameraX = data.cameraX ?? 0;
    this.npcId = data.npcId;
    this.running = false;
    this.cutscenePlaying = false;
    this.dialogueTriggered = false;
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
    this.buildActors();
    this.buildDoor();

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
    } else {
      this.running = true;
    }
  }

  private buildBackground(): void {
    this.holyworldBackground = this.add
      .image(0, 0, LEVEL4_ASSET_KEYS.holyworldBackground)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(Depth.SKY);
    this.resizeBackground();
  }

  private resizeBackground(): void {
    const fit = computeCoverFit(
      1672,
      940,
      this.cameras.main.width,
      this.cameras.main.height,
    );
    this.holyworldBackground.setScale(fit.scale).setPosition(fit.offsetX, fit.offsetY);
  }

  private buildToiletStrip(): void {
    this.toiletStrip = this.add
      .image(0, GROUND_Y - TOILET_STRIP_HEIGHT, LEVEL4_ASSET_KEYS.toiletStrip)
      .setOrigin(0, 0)
      .setDepth(Depth.ENVIRONMENT + 5);
  }

  private buildActors(): void {
    this.player = this.createActor(this.playerCharacter, this.playerX, GROUND_Y, 1, 'walk');
    this.npc = this.createActor(this.npcCharacter, NPC_STALL_X, GROUND_Y, NPC_WAIT_FACING, 'idle');
  }

  private buildDoor(): void {
    this.stallDoor = this.add
      .image(NPC_STALL_X + 16, GROUND_Y, LEVEL4_ASSET_KEYS.stallDoor)
      .setOrigin(0.5, 1)
      .setDepth(Depth.FOREGROUND + 10)
      .setAngle(-10);
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
    if (actor.motion === 'walk') {
      return actor.character.gameplay.run[
        loopedFrameIndex(now, actor.character.gameplay.run.length, RUN_CYCLE_MS)
      ];
    }
    const { idle, run } = actor.character.gameplay;
    return idle ?? run[staticRunFrameIndex(run.length)];
  }

  private syncActor(actor: Level4Actor, now: number): void {
    const frame = this.resolveActorFrame(actor, now);
    const scale = resolveGameplayScale(actor.character, actor.motion === 'walk' ? 'walk' : 'idle');
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
    this.resizeBackground();
    this.cameraX = Phaser.Math.Clamp(this.cameraX, 0, Math.max(0, LEVEL4_WORLD_WIDTH - camera.width));
    this.toiletStrip.setPosition(0, GROUND_Y - TOILET_STRIP_HEIGHT);
    this.stallDoor.setPosition(NPC_STALL_X + 16, GROUND_Y);
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

    if (this.running && !this.cutscenePlaying) {
      this.player.x += (RUN_SPEED * delta) / 1000;
      this.player.facing = 1;
      if (!this.dialogueTriggered && this.player.x >= DIALOGUE_TRIGGER_X) {
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
    this.running = false;
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
    this.cutscenePlaying = true;
    this.running = false;
    this.player.motion = 'walk';
    this.npc.motion = 'walk';
    this.npc.facing = 1;
    this.player.facing = 1;

    let arrivals = 0;
    const onArrived = (): void => {
      arrivals += 1;
      if (arrivals < 2) return;
      this.closeDoorThenWait();
    };

    this.tweens.add({
      targets: this.player,
      x: PLAYER_STALL_X,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: onArrived,
    });
    this.tweens.add({
      targets: this.npc,
      x: NPC_STALL_X,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: onArrived,
    });
  }

  private closeDoorThenWait(): void {
    this.tweens.add({
      targets: this.stallDoor,
      angle: 0,
      x: NPC_STALL_X + 8,
      duration: 240,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.time.delayedCall(4000, () => this.openDoorAndExit());
      },
    });
  }

  private openDoorAndExit(): void {
    this.npc.facing = -1;
    this.tweens.add({
      targets: this.stallDoor,
      angle: -10,
      x: NPC_STALL_X + 16,
      duration: 240,
      ease: 'Quad.easeOut',
    });
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

  private resumePlay(): void {
    if (this.finished) return;
    this.cutscenePlaying = false;
    this.running = true;
    this.player.motion = 'walk';
  }

  private finishLevel(): void {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.cutscenePlaying = false;
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
    return TOILET_STRIP_WIDTH + this.cameras.main.width / 2 + 16;
  }

  private cleanup(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.holyworldBackground?.destroy();
    this.toiletStrip?.destroy();
    this.stallDoor?.destroy();
    this.player?.sprite.destroy();
    this.npc?.sprite.destroy();
  }
}
