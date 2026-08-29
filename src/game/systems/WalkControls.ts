import Phaser from 'phaser';

/** -1 walking left, 1 walking right, 0 standing still. */
export type WalkDirection = -1 | 0 | 1;

/**
 * Walking pace in logical pixels per second, shared by every level that moves
 * the player by hand rather than through the Berlin runner's physics. This is
 * the knob for how fast the player crosses a room: higher is faster.
 */
export const WALK_SPEED = 420;

export interface WalkInputOptions {
  /**
   * Depth for the touch hold zones. Keep below `Depth.UI` so the fullscreen
   * exit control and the pause/sound HUD still win the pointer.
   */
  zoneDepth: number;
  /** Fired the first time a hold lands, so a scene can fade its own hint. */
  onHold?: () => void;
}

/**
 * Manual left/right walk input, desktop and touch behind one interface so a
 * scene never branches on device.
 *
 * Desktop: arrows or A/D. Touch: hold the left or right half of the screen.
 *
 * Extracted from Level 2 so the connective walking levels share one control
 * mechanism instead of each growing its own copy. `layout` must be called
 * from the scene's responsive pass so the hold zones track the viewport.
 */
export class WalkInput {
  private readonly cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly keyA?: Phaser.Input.Keyboard.Key;
  private readonly keyD?: Phaser.Input.Keyboard.Key;
  private leftZone?: Phaser.GameObjects.Zone;
  private rightZone?: Phaser.GameObjects.Zone;
  /** Pointer ids currently held on each walk zone, so multi-touch releases cleanly. */
  private readonly leftPointers = new Set<number>();
  private readonly rightPointers = new Set<number>();
  private readonly release: (pointer: Phaser.Input.Pointer) => void;
  private readonly clearAll: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: WalkInputOptions,
  ) {
    const keyboard = scene.input.keyboard;
    this.cursors = keyboard?.createCursorKeys();
    this.keyA = keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    // Released anywhere, including off the zone or off the canvas entirely.
    this.release = (pointer: Phaser.Input.Pointer): void => {
      this.leftPointers.delete(pointer.id);
      this.rightPointers.delete(pointer.id);
    };
    this.clearAll = (): void => {
      this.leftPointers.clear();
      this.rightPointers.clear();
    };

    if (scene.game.device.input.touch) this.createTouchZones();
  }

  private createTouchZones(): void {
    const scene = this.scene;
    // A second pointer so switching sides mid-hold is never dropped.
    scene.input.addPointer(1);

    const depth = this.options.zoneDepth;
    this.leftZone = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    this.rightZone = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    this.leftZone.setInteractive();
    this.rightZone.setInteractive();

    const hold = (set: Set<number>) => (pointer: Phaser.Input.Pointer) => {
      pointer.event?.preventDefault();
      set.add(pointer.id);
      this.options.onHold?.();
    };
    this.leftZone.on('pointerdown', hold(this.leftPointers));
    this.rightZone.on('pointerdown', hold(this.rightPointers));

    scene.input.on(Phaser.Input.Events.POINTER_UP, this.release);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.release);
    scene.input.on(Phaser.Input.Events.GAME_OUT, this.clearAll);
  }

  /** Re-seats the hold zones over the current viewport. */
  layout(width: number, height: number): void {
    if (!this.leftZone || !this.rightZone) return;
    // Zone.setSize resizes the input hit area with it by default.
    const half = width / 2;
    this.leftZone.setPosition(0, 0).setSize(half, height);
    this.rightZone.setPosition(half, 0).setSize(half, height);
  }

  get direction(): WalkDirection {
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

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.release);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.release);
    this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.clearAll);
    this.clearAll();
    this.leftZone?.destroy();
    this.rightZone?.destroy();
    this.leftZone = undefined;
    this.rightZone = undefined;
  }
}
