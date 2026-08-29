import Phaser from 'phaser';
import { footOffset, loopedFrameIndex, RUN_CYCLE_MS, staticRunFrameIndex } from '../characters/characterAnimation';
import { resolveGameplayScale, type CharacterAssetRef, type CharacterDefinition } from '../characters/characterManifest';
import type { EditableObject } from '../systems/SceneEditor';
import { computeContainFit } from './dialogueLayoutMetrics';
import { LEVEL4_ASSET_KEYS } from '../level/level4/level4Assets';
import type { ResolvedSceneCast } from './dialogueCast';

const TOILET_CANONICAL_WIDTH = 1532;
const TOILET_CANONICAL_HEIGHT = 175;
const FLOOR_Y = 148;
const PLAYER_X = 210;
const NPC_X = 1125;
const DOOR_X = 1084;
const DOOR_Y = 168;
const RESIZE_FILL_RATIO = 0.96;

interface ToiletActor {
  sprite: Phaser.GameObjects.Sprite;
  character: CharacterDefinition;
  motion: 'idle' | 'walk';
  x: number;
  y: number;
  facing: 1 | -1;
  currentKey?: string;
}

export class ToiletSceneView {
  readonly root: Phaser.GameObjects.Container;
  private readonly content: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Image;
  private readonly door: Phaser.GameObjects.Image;
  private readonly seated: ToiletActor;
  private readonly arriving: ToiletActor;

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
    cast: ResolvedSceneCast,
  ) {
    this.background = this.scene.add.image(0, 0, LEVEL4_ASSET_KEYS.toiletStrip).setOrigin(0, 0);
    this.door = this.scene.add.image(DOOR_X, DOOR_Y, LEVEL4_ASSET_KEYS.stallDoor).setOrigin(0.5, 1);
    this.seated = this.buildActor(cast.seated, PLAYER_X, FLOOR_Y, 1);
    this.arriving = this.buildActor(cast.arriving, NPC_X, FLOOR_Y, 1);
    const children = [this.background, this.door, this.seated.sprite, this.arriving.sprite];
    this.content = this.scene.add.container(0, 0, children);
    this.root = this.scene.add.container(0, 0, [this.content]);
    this.resize(width, height);
  }

  private buildActor(
    character: CharacterDefinition,
    x: number,
    floorY: number,
    facing: 1 | -1,
  ): ToiletActor {
    const frame = character.gameplay.idle ?? character.gameplay.run[staticRunFrameIndex(character.gameplay.run.length)];
    const scale = resolveGameplayScale(character, 'idle');
    const sprite = this.scene.add.sprite(x, 0, frame.key).setOrigin(0.5, 1).setScale(scale);
    const actor: ToiletActor = {
      sprite,
      character,
      motion: 'idle',
      x,
      y: floorY,
      facing,
      currentKey: frame.key,
    };
    this.syncActor(actor, this.scene.time.now);
    return actor;
  }

  private resolveFrame(actor: ToiletActor, now: number): CharacterAssetRef {
    if (actor.motion === 'walk') {
      const { run } = actor.character.gameplay;
      return run[loopedFrameIndex(now, run.length, RUN_CYCLE_MS)];
    }
    const { idle, run } = actor.character.gameplay;
    return idle ?? run[staticRunFrameIndex(run.length)];
  }

  private syncActor(actor: ToiletActor, now: number): void {
    const frame = this.resolveFrame(actor, now);
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

  resize(width: number, height: number): void {
    const fit = computeContainFit(
      TOILET_CANONICAL_WIDTH,
      TOILET_CANONICAL_HEIGHT,
      width,
      height,
      RESIZE_FILL_RATIO,
    );
    this.content.setScale(fit.scale).setPosition(fit.offsetX, fit.offsetY);
  }

  playArrival(onComplete: () => void): void {
    this.scene.time.delayedCall(220, onComplete);
  }

  update(now: number): void {
    this.syncActor(this.seated, now);
    this.syncActor(this.arriving, now);
  }

  getEditableObjects(): EditableObject[] {
    return [];
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
