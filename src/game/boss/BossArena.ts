import Phaser from 'phaser';
import { LEVEL4_ASSET_KEYS } from '../level/level4/level4Assets';
import { BOSS_ART } from './bossAssets';
import { BOSS_ARENA } from './bossConfig';
import { BossDepth } from './bossConstants';
import { resolveBossArenaFrames } from './bossArenaLayout';
import type { ArenaBounds } from './types';

/** Static arena furniture: Holyworld backdrop, authored platform and walls. */
export class BossArena {
  private readonly background: Phaser.GameObjects.Image;
  private readonly platform: Phaser.GameObjects.Image;

  constructor(private readonly scene: Phaser.Scene) {
    this.background = scene.add
      .image(0, 0, LEVEL4_ASSET_KEYS.holyworldBackground)
      .setOrigin(0.5)
      .setDepth(BossDepth.BACKDROP);
    this.platform = scene.add
      .image(0, 0, BOSS_ART.platform.key)
      .setOrigin(0.5, 0)
      // In front of the boss only below the floor lip, so the spawn reads as
      // an emergence from beneath the ground. Lasers/player still sit above.
      .setDepth(BossDepth.BOSS + 1);
  }

  /** Bounds are recomputed from the camera so the arena tracks any viewport. */
  static getBounds(cameraWidth: number): ArenaBounds {
    return {
      minX: BOSS_ARENA.sideMarginPx,
      maxX: Math.max(BOSS_ARENA.sideMarginPx + 1, cameraWidth - BOSS_ARENA.sideMarginPx),
    };
  }

  redraw(): void {
    const { width, height } = this.scene.cameras.main;
    // Physics/gameplay still uses BOSS_ARENA.floorY. Both images are drawn
    // through the one arena transform, which is grounded on that same floor
    // line, so the backdrop's ground, the platform's grass lip and the
    // player's feet stay on it whatever the viewport's aspect ratio is.
    const frames = resolveBossArenaFrames(width, height);
    this.background
      .setPosition(frames.backdrop.x, frames.backdrop.y)
      .setDisplaySize(frames.backdrop.width, frames.backdrop.height);
    this.platform
      // Origin (0.5, 0): the PNG hangs from its top edge.
      .setPosition(frames.platform.x, frames.platform.y - frames.platform.height / 2)
      .setDisplaySize(frames.platform.width, frames.platform.height);
  }

  destroy(): void {
    this.background.destroy();
    this.platform.destroy();
  }
}
