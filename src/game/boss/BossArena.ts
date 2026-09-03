import Phaser from 'phaser';
import { LEVEL4_ASSET_KEYS } from '../level/level4/level4Assets';
import { BOSS_ART, BOSS_PLATFORM } from './bossAssets';
import { BOSS_ARENA } from './bossConfig';
import { BossDepth } from './bossConstants';
import type { ArenaBounds } from './types';

const HOLYWORLD_BACKGROUND_SOURCE_HEIGHT = 941;

/** Static arena furniture: Holyworld backdrop, authored platform and walls. */
export class BossArena {
  private readonly background: Phaser.GameObjects.TileSprite;
  private readonly platform: Phaser.GameObjects.Image;

  constructor(private readonly scene: Phaser.Scene) {
    this.background = scene.add
      .tileSprite(0, 0, 1, 1, LEVEL4_ASSET_KEYS.holyworldBackground)
      .setOrigin(0, 0)
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
    const backgroundScale = height / HOLYWORLD_BACKGROUND_SOURCE_HEIGHT;
    this.background
      .setPosition(0, 0)
      .setSize(width, height)
      .setTileScale(backgroundScale, backgroundScale);

    // Physics/gameplay still uses BOSS_ARENA.floorY. The PNG is positioned by
    // its measured first non-transparent row so its grass lip lands on that
    // exact standing surface, independent of viewport width.
    const platformScale = width / BOSS_PLATFORM.sourceWidth;
    this.platform
      .setPosition(
        width / 2,
        BOSS_ARENA.floorY - BOSS_PLATFORM.visibleTopRow * platformScale,
      )
      .setScale(platformScale);

  }

  destroy(): void {
    this.background.destroy();
    this.platform.destroy();
  }
}
