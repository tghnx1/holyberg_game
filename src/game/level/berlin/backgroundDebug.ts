import Phaser from 'phaser';
import { Depth, WORLD_WIDTH } from '../../constants';

export interface DebugTarget {
  name: string;
  object: Phaser.GameObjects.Image;
  /** Set when `object` is a child of a container positioned in world space. */
  container?: Phaser.GameObjects.Container;
}

const GRID_STEP = 100;
const LABEL_STEP = 500;
const GRID_Y_RANGE = 1200;
const DEBUG_BASE_DEPTH = Depth.UI + 100;

export function isBackgroundDebugEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).get('debugBackground') === '1';
}

/** Draws a world-space X/Y grid, per-target bounds/origin markers, and live position labels. */
export function attachBackgroundDebug(scene: Phaser.Scene, targets: DebugTarget[]): void {
  const grid = scene.add
    .graphics()
    .setDepth(DEBUG_BASE_DEPTH)
    .setScrollFactor(1, 0);
  grid.lineStyle(1, 0x00ff88, 0.2);
  for (let x = 0; x <= WORLD_WIDTH; x += GRID_STEP) {
    grid.lineBetween(x, -GRID_Y_RANGE, x, GRID_Y_RANGE);
  }
  for (let y = -GRID_Y_RANGE; y <= GRID_Y_RANGE; y += GRID_STEP) {
    grid.lineBetween(0, y, WORLD_WIDTH, y);
  }

  for (let x = 0; x <= WORLD_WIDTH; x += LABEL_STEP) {
    scene.add
      .text(x + 2, 2, `${x}`, {
        fontFamily: 'Space Mono',
        fontSize: '12px',
        color: '#00ff88',
      })
      .setDepth(DEBUG_BASE_DEPTH + 1)
      .setScrollFactor(1, 0);
  }

  const overlay = scene.add
    .graphics()
    .setDepth(DEBUG_BASE_DEPTH + 2)
    .setScrollFactor(1, 0);

  const labels = targets.map(() =>
    scene.add
      .text(0, 0, '', {
        fontFamily: 'Space Mono',
        fontSize: '10px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 3, y: 2 },
      })
      .setDepth(DEBUG_BASE_DEPTH + 3)
      .setScrollFactor(1, 0),
  );

  scene.events.on(Phaser.Scenes.Events.UPDATE, () => {
    overlay.clear();
    overlay.lineStyle(1, 0xff00ff, 0.9);
    overlay.fillStyle(0xffff00, 1);

    targets.forEach((target, index) => {
      const { object, container } = target;
      const worldX = (container?.x ?? 0) + object.x;
      const worldY = (container?.y ?? 0) + object.y;

      overlay.strokeRectShape(object.getBounds());
      overlay.fillCircle(worldX, worldY, 3);

      labels[index].setPosition(worldX + 6, worldY - 14);
      labels[index].setText(
        [
          target.name,
          `world (${worldX.toFixed(0)}, ${worldY.toFixed(0)})`,
          `local (${object.x.toFixed(0)}, ${object.y.toFixed(0)})`,
          `depth ${object.depth} sf (${object.scrollFactorX}, ${object.scrollFactorY})`,
        ].join('\n'),
      );
    });
  });
}
