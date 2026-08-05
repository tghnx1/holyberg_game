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

function addCircle(options: ShapeOptions & { radius: number }): Phaser.GameObjects.Arc {
  const { scene, layer, x, y, radius, color, depth, scrollFactorX, scrollFactorY } = options;
  return configure(
    scene.add.circle(x, y, radius, color),
    layer,
    depth,
    scrollFactorX,
    scrollFactorY,
  );
}

function addEllipse(
  options: ShapeOptions & { width: number; height: number },
): Phaser.GameObjects.Ellipse {
  const { scene, layer, x, y, width, height, color, depth, scrollFactorX, scrollFactorY } = options;
  return configure(
    scene.add.ellipse(x, y, width, height, color),
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
  addCircle({
    scene,
    layer: layers.sky,
    x: 790,
    y: 245,
    radius: 145,
    color: 0xffb044,
    depth: Depth.SKY,
    scrollFactorX: 0.03,
  }).setAlpha(0.92);

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
  // Very distant Berlin silhouettes and cranes.
  for (let x = 0; x < WORLD_WIDTH; x += 210) {
    rectangle(
      layers.farBackground,
      x,
      490,
      180,
      120 + (x % 420) / 3,
      0x211938,
      Depth.FAR_BACKGROUND,
      0.18,
    );
  }
  for (const x of [1700, 3200]) {
    rectangle(layers.farBackground, x, 315, 12, 310, 0x17142d, Depth.FAR_BACKGROUND, 0.18);
    addCircle({
      scene,
      layer: layers.farBackground,
      x,
      y: 255,
      radius: 42,
      color: 0x27203f,
      depth: Depth.FAR_BACKGROUND,
      scrollFactorX: 0.18,
    });
  }
  for (const x of [1250, 3650]) {
    rectangle(layers.farBackground, x, 270, 8, 250, 0x20172f, Depth.FAR_BACKGROUND, 0.15);
    rectangle(layers.farBackground, x + 90, 160, 190, 7, 0x20172f, Depth.FAR_BACKGROUND, 0.15);
  }

  // Foreground building row: a single non-tiled texture replacing the
  // procedural house rectangles, windows and signs formerly drawn here.
  // Height (and therefore scale) matches the removed apartment/street
  // façade block (500px tall, bottom pinned to GROUND_Y), and the scroll
  // factor is derived from how far the texture can travel relative to how
  // far the camera travels across the whole level, so its left edge is
  // visible at the level start and its right edge at the level end.
  const buildings = scene.add.image(0, GROUND_Y, 'berlin-foreground-buildings').setOrigin(0, 1);
  buildings.setScale(500 / buildings.height);
  buildings.setDepth(Depth.ENVIRONMENT);
  const cameraTravel = Math.max(1, WORLD_WIDTH - DESIGN_WIDTH);
  const textureTravel = Math.max(0, buildings.displayWidth - DESIGN_WIDTH);
  const scrollFactor = Phaser.Math.Clamp(textureTravel / cameraTravel, 0, 1);
  buildings.setScrollFactor(scrollFactor, 0);
  layers.environment.add(buildings);

  for (let x = 850; x < 2400; x += 240) {
    const height = 260 + ((x / 10) % 3) * 45;
    rectangle(
      layers.midBackground,
      x,
      GROUND_Y - height / 2,
      220,
      height,
      x % 480 === 0 ? 0x4a294e : 0x33263f,
      Depth.MID_BACKGROUND,
      0.45,
    );
    for (let windowY = GROUND_Y - height + 45; windowY < GROUND_Y - 40; windowY += 65) {
      for (let windowX = x - 75; windowX < x + 85; windowX += 50) {
        rectangle(
          layers.midBackground,
          windowX,
          windowY,
          24,
          34,
          0xee8248,
          Depth.MID_BACKGROUND,
          0.45,
        );
      }
    }
  }
  // The bridge section uses distinct factors from skyline to foreground railing.
  rectangle(layers.midBackground, 3350, 540, 1900, 140, 0x34235d, Depth.MID_BACKGROUND, 0.35);
  for (let x = 2520; x < 4250; x += 230) {
    addEllipse({
      scene,
      layer: layers.midBackground,
      x,
      y: 505,
      width: 210,
      height: 150,
      color: 0x8f3f59,
      depth: Depth.MID_BACKGROUND,
      scrollFactorX: 0.55,
    });
    addEllipse({
      scene,
      layer: layers.midBackground,
      x,
      y: 520,
      width: 160,
      height: 120,
      color: 0x34235d,
      depth: Depth.MID_BACKGROUND,
      scrollFactorX: 0.55,
    });
    rectangle(layers.midBackground, x, 510, 18, 150, 0x73314b, Depth.MID_BACKGROUND, 0.55);
  }

  // Club exterior and nearby buildings (distant silhouette row only; the
  // near-camera accent stripe and signage previously drawn here were part
  // of the removed environment-layer house scenery).
  for (let x = 4380; x < WORLD_WIDTH; x += 260) {
    rectangle(
      layers.midBackground,
      x,
      390,
      230,
      440,
      x % 520 ? 0x19172a : 0x24132e,
      Depth.MID_BACKGROUND,
      0.5,
    );
  }

  // Decorative near-camera elements never receive physics bodies.
  for (let x = 2460; x < 4320; x += 180) {
    rectangle(layers.foreground, x, 555, 8, 110, 0x17101f, Depth.FOREGROUND, 1.08);
    rectangle(layers.foreground, x + 90, 520, 180, 8, 0x17101f, Depth.FOREGROUND, 1.08);
  }
  for (const x of [980, 2250, 4450, 5480]) {
    rectangle(layers.foreground, x, 410, 12, 400, 0x14101d, Depth.FOREGROUND, 1.08);
    addCircle({
      scene,
      layer: layers.foreground,
      x,
      y: 205,
      radius: 24,
      color: 0xffa65c,
      depth: Depth.FOREGROUND,
      scrollFactorX: 1.08,
    }).setAlpha(0.8);
  }

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
