import Phaser from 'phaser';
import { BOSS_ARENA } from './bossConfig';
import { BossDepth, BossPalette } from './bossConstants';
import type { ArenaBounds } from './types';

/** Static arena furniture: floor, side walls and the backdrop grid. */
export class BossArena {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(BossDepth.ARENA);
  }

  /** Bounds are recomputed from the camera so the arena tracks any viewport. */
  static getBounds(cameraWidth: number): ArenaBounds {
    return {
      minX: BOSS_ARENA.sideMarginPx,
      maxX: Math.max(BOSS_ARENA.sideMarginPx + 1, cameraWidth - BOSS_ARENA.sideMarginPx),
    };
  }

  redraw(bounds: ArenaBounds): void {
    const { width, height } = this.scene.cameras.main;
    this.graphics.clear();

    this.graphics.lineStyle(1, 0x2a1440, 0.5);
    for (let x = 0; x < width; x += 64) this.graphics.lineBetween(x, 0, x, height);
    for (let y = 0; y < height; y += 64) this.graphics.lineBetween(0, y, width, y);

    this.graphics.fillStyle(BossPalette.floor, 1);
    this.graphics.fillRect(0, BOSS_ARENA.floorY, width, height - BOSS_ARENA.floorY);
    this.graphics.lineStyle(4, BossPalette.wall, 1);
    this.graphics.lineBetween(0, BOSS_ARENA.floorY, width, BOSS_ARENA.floorY);

    // Walls mark exactly where movement is clamped, so the edges never surprise.
    this.graphics.fillStyle(BossPalette.wall, 0.55);
    this.graphics.fillRect(0, 0, bounds.minX, BOSS_ARENA.floorY);
    this.graphics.fillRect(bounds.maxX, 0, width - bounds.maxX, BOSS_ARENA.floorY);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
