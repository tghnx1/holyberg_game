import Phaser from 'phaser';
import { BossDepth } from './bossConstants';
import type { MoveDirection } from './bossPlayerMovement';

/**
 * Movement and dash input for the boss arena, desktop and touch behind one
 * interface so the scene never branches on device.
 *
 * Desktop: arrows or A/D to move, Space/Shift to dash — the same keys Level 1
 * already uses for movement and its jump.
 * Touch: hold the left or right half of the arena to move, tap DASH to dash.
 */
export class BossInput {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private readonly keyA?: Phaser.Input.Keyboard.Key;
  private readonly keyD?: Phaser.Input.Keyboard.Key;
  private touchDirection: MoveDirection = 0;
  private dashQueued = false;
  private dashButton?: Phaser.GameObjects.Container;
  private readonly movePointers = new Map<number, MoveDirection>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly touchEnabled: boolean,
  ) {
    const keyboard = scene.input.keyboard;
    this.cursors = keyboard?.createCursorKeys();
    this.keyA = keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    keyboard?.on('keydown-SPACE', this.queueDash);
    keyboard?.on('keydown-SHIFT', this.queueDash);
    if (touchEnabled) this.createTouchControls();
  }

  private queueDash = (): void => {
    this.dashQueued = true;
  };

  private createTouchControls(): void {
    // Extra pointers so a held movement side and a dash tap register together.
    this.scene.input.addPointer(2);
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

    const label = this.scene.add
      .text(0, 0, 'DASH', {
        fontFamily: 'Archivo Black',
        fontSize: '22px',
        color: '#090611',
      })
      .setOrigin(0.5);
    const pad = this.scene.add.circle(0, 0, 52, 0xffdf57, 0.9).setStrokeStyle(4, 0xff477e);
    this.dashButton = this.scene.add
      .container(width - 96, height - 96, [pad, label])
      .setDepth(BossDepth.UI)
      .setSize(104, 104)
      .setInteractive({ useHandCursor: true });
    this.dashButton.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      this.dashQueued = true;
      pad.setAlpha(0.55);
      // Keep the dash tap from also being read as a movement press.
      event.stopPropagation();
      this.movePointers.delete(pointer.id);
      this.resolveTouchDirection();
    });
    this.dashButton.on('pointerup', () => pad.setAlpha(0.9));
    this.dashButton.on('pointerout', () => pad.setAlpha(0.9));
  }

  /** Latest press wins, so sliding a thumb across the middle turns Atmos around. */
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

  /** True once per dash request; reading it clears the queue. */
  consumeDash(): boolean {
    if (!this.dashQueued) return false;
    this.dashQueued = false;
    return true;
  }

  reposition(width: number, height: number): void {
    this.dashButton?.setPosition(width - 96, height - 96);
  }

  destroy(): void {
    const keyboard = this.scene.input.keyboard;
    keyboard?.off('keydown-SPACE', this.queueDash);
    keyboard?.off('keydown-SHIFT', this.queueDash);
    this.dashButton?.destroy(true);
    this.movePointers.clear();
  }

  get isTouch(): boolean {
    return this.touchEnabled;
  }
}
