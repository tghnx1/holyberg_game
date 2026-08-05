import Phaser from 'phaser';
import { Depth, DESIGN_HEIGHT, DESIGN_WIDTH, GROUND_Y, WORLD_WIDTH } from '../constants';
import { GROUND_SEGMENTS, PIT_ZONES } from './berlin/berlinLevelConfig';
import type { SceneLayers } from './sceneLayers';

export interface ObstacleSpec {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'barrier' | 'scooter' | 'bag' | 'car' | 'night-creature';
}

export const OBSTACLES: ObstacleSpec[] = [
  { x: 1150, y: GROUND_Y - 30, width: 68, height: 54, kind: 'barrier' },
  { x: 1580, y: GROUND_Y - 28, width: 70, height: 45, kind: 'scooter' },
  { x: 2080, y: GROUND_Y - 20, width: 48, height: 36, kind: 'bag' },
  { x: 3420, y: GROUND_Y - 35, width: 110, height: 64, kind: 'night-creature' },
  { x: 4720, y: GROUND_Y - 40, width: 150, height: 70, kind: 'car' },
];

interface ShapeOptions {
  scene: Phaser.Scene;
  layer: Phaser.GameObjects.Layer;
  x: number;
  y: number;
  color: number;
  depth: number;
  scrollFactorX: number;
  scrollFactorY?: number;
}

interface RectangleOptions extends ShapeOptions {
  width: number;
  height: number;
}

function configure<
  T extends Phaser.GameObjects.GameObject &
    Phaser.GameObjects.Components.Depth &
    Phaser.GameObjects.Components.ScrollFactor,
>(
  object: T,
  layer: Phaser.GameObjects.Layer,
  depth: number,
  scrollFactorX: number,
  scrollFactorY = 1,
): T {
  object.setDepth(depth).setScrollFactor(scrollFactorX, scrollFactorY);
  layer.add(object);
  return object;
}

function addRectangle(options: RectangleOptions): Phaser.GameObjects.Rectangle {
  const { scene, layer, x, y, width, height, color, depth, scrollFactorX, scrollFactorY } = options;
  return configure(
    scene.add.rectangle(x, y, width, height, color),
    layer,
    depth,
    scrollFactorX,
    scrollFactorY,
  );
}

function addTriangle(
  options: ShapeOptions & { points: [number, number, number, number, number, number] },
): Phaser.GameObjects.Triangle {
  const { scene, layer, x, y, points, color, depth, scrollFactorX, scrollFactorY } = options;
  return configure(
    scene.add.triangle(x, y, ...points, color),
    layer,
    depth,
    scrollFactorX,
    scrollFactorY,
  );
}

export function buildBerlinWorld(scene: Phaser.Scene, layers: SceneLayers): void {
  const rectangle = (
    layer: Phaser.GameObjects.Layer,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    depth: number,
    scrollFactorX: number,
  ) => addRectangle({ scene, layer, x, y, width, height, color, depth, scrollFactorX });

  // A fixed sunset image sits behind all parallax scenery and never scrolls
  // or repeats; it covers exactly the viewport, not the whole world.
  layers.sky.add(
    scene.add
      .image(0, 0, 'berlin-sky')
      .setOrigin(0, 0)
      .setDisplaySize(DESIGN_WIDTH, DESIGN_HEIGHT)
      .setScrollFactor(0)
      .setDepth(Depth.SKY),
  );
  // City skyline sits above the sky and below every other layer, fixed to
  // the camera (no physics, no tiling). Its bottom edge is pinned to exactly
  // half the design height, recomputed from DESIGN_HEIGHT rather than a
  // hardcoded pixel value; it's scaled uniformly so it covers the full
  // design width without distorting the artwork.
  const city = scene.add.image(0, DESIGN_HEIGHT / 2, 'berlin-city').setOrigin(0, 1);
  city.setScale((DESIGN_WIDTH / city.width) * 1.5);
  const cityScrollFactor = Phaser.Math.Clamp(
    (city.displayWidth - DESIGN_WIDTH) / (WORLD_WIDTH - DESIGN_WIDTH),
    0,
    1,
  );
  city.setScrollFactor(cityScrollFactor, 0).setDepth(Depth.MID_BACKGROUND);
  layers.midBackground.add(city);

  // Mid-background building row: a single non-tiled texture replacing the
  // procedural building rectangles and their nested window rectangles that
  // used to be drawn here. Scaled to the removed block's height, with a
  // scroll factor derived from how far the texture can travel relative to
  // how far the camera travels across the whole level.
  const houses = scene.add
    .image(0, GROUND_Y, 'berlin-mid-buildings')
    .setOrigin(0, 0.9);
  houses.setScale(650 / houses.height);
  const cameraTravel = Math.max(1, WORLD_WIDTH - DESIGN_WIDTH);
  const textureTravel = Math.max(0, houses.displayWidth - DESIGN_WIDTH);
  const housesScrollFactor = Phaser.Math.Clamp(
    textureTravel / cameraTravel,
    0,
    1,
  );
  houses
    .setScrollFactor(housesScrollFactor, 0)
    .setDepth(Depth.MID_BACKGROUND);
  layers.midBackground.add(houses);

  // Asphalt is drawn per ground segment (not the full world) so it stops exactly
  // at each pit boundary, matching the physics ground colliders in BerlinScene.
  const asphaltColor = 0x100c1b;
  const voidColor = 0x050308;
  GROUND_SEGMENTS.forEach((segment) => {
    rectangle(
      layers.gameplay,
      (segment.startX + segment.endX) / 2,
      GROUND_Y + 55,
      segment.endX - segment.startX,
      110,
      asphaltColor,
      Depth.GAMEPLAY,
      1,
    );
  });

  // A dark void fills each pit range, and jagged "teeth" break up the asphalt
  // edges on either side so the gap reads clearly before the player reaches it.
  PIT_ZONES.forEach((pit) => {
    rectangle(
      layers.gameplay,
      (pit.startX + pit.endX) / 2,
      GROUND_Y + 230,
      pit.endX - pit.startX,
      440,
      voidColor,
      Depth.GAMEPLAY,
      1,
    );
    [pit.startX, pit.endX].forEach((edgeX, index) => {
      const dir = index === 0 ? 1 : -1;
      for (let i = 0; i < 4; i += 1) {
        const toothX = edgeX + dir * (10 + i * 16);
        const toothHeight = 14 + ((i * 7) % 20);
        addTriangle({
          scene,
          layer: layers.gameplay,
          x: toothX,
          y: GROUND_Y,
          points: [-9 * dir, 0, 9 * dir, 0, 0, toothHeight],
          color: asphaltColor,
          depth: Depth.GAMEPLAY,
          scrollFactorX: 1,
        });
      }
    });
  });
}
