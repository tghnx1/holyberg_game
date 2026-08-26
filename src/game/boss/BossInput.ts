import Phaser from 'phaser';
import { BossDepth } from './bossConstants';
import type { MoveDirection } from './bossPlayerMovement';

/**
 * Movement input for the boss arena, desktop and touch behind one interface so
 * the scene never branches on device.
 *
 * Left and right are the only inputs the fight has.
 * Desktop: arrows or A/D. Touch: hold the left or right half of the arena.
 */
export class BossInput {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private readonly keyA?: Phaser.Input.Keyboard.Key;
  private readonly keyD?: Phaser.Input.Keyboard.Key;
  private touchDirection: MoveDirection = 0;
  private readonly movePointers = new Map<number, MoveDirection>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly touchEnabled: boolean,
  ) {
    const keyboard = scene.input.keyboard;
    this.cursors = keyboard?.createCursorKeys();
    this.keyA = keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    if (touchEnabled) this.createTouchControls();
  }

  private createTouchControls(): void {
    // A second pointer so switching sides mid-hold is never dropped.
    this.scene.input.addPointer(1);
    const { width, height } = this.scene.cameras.main;

    const zone = this.scene.add
      .zone(0, 0, width, height)
      .setOrigin(0, 0)
      .setDepth(BossDepth.UI - 1)
      .setInteractive();
    const updateFromPointer = (pointer: Phaser.Input.Pointer): void => {
      this.movePointers.set(pointer.id, pointer.x < this.scene.cameras.main.width / 2 ? -1 : 1);
      this.resolveTouchDirection();
    };
    zone.on('pointerdown', updateFromPointer);
    zone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) updateFromPointer(pointer);
    });
    const clearPointer = (pointer: Phaser.Input.Pointer): void => {
      this.movePointers.delete(pointer.id);
      this.resolveTouchDirection();
    };
    zone.on('pointerup', clearPointer);
    zone.on('pointerout', clearPointer);
  }

  /** Latest press wins, so sliding a thumb across the middle turns the player around. */
  private resolveTouchDirection(): void {
    const directions = [...this.movePointers.values()];
    this.touchDirection = directions.length === 0 ? 0 : directions[directions.length - 1];
  }

  get direction(): MoveDirection {
    const left = this.cursors?.left.isDown === true || this.keyA?.isDown === true;
    const right = this.cursors?.right.isDown === true || this.keyD?.isDown === true;
    if (left !== right) return left ? -1 : 1;
    return this.touchDirection;
  }

  destroy(): void {
    this.movePointers.clear();
  }

  get isTouch(): boolean {
    return this.touchEnabled;
  }
}
