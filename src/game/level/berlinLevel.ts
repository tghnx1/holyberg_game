import Phaser from 'phaser';
import { DESIGN_WIDTH, GROUND_Y, WORLD_WIDTH } from '../constants';
import { GROUND_SEGMENTS, PIT_ZONES } from './berlin/berlinLevelConfig';
import { backgroundLayout } from './berlin/backgroundLayout';
import { attachBackgroundDebug, isBackgroundDebugEnabled, type DebugTarget } from './berlin/backgroundDebug';
import type { SceneLayers } from './sceneLayers';

// Back-to-front stacking order for the shared mid-background layer: the
// first entry renders farthest away, the last renders closest to camera.
// Changing this array (and only this array) changes the visual stacking
// order of these six objects.
const BACKGROUND_ORDER = [
  'sky',
  'city',
  'trainLeft',
  'trainRight',
  'railway',
  'houses',
] as const;

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

/** Creates a full-height-scaled, bottom-anchored (origin 0,1) background image. */
function createBackgroundImage(
  scene: Phaser.Scene,
  layout: { key: string; baselineY: number; targetHeight: number },
): Phaser.GameObjects.Image {
  const image = scene.add.image(0, layout.baselineY, layout.key).setOrigin(0, 1);
  image.setScale(layout.targetHeight / image.height);
  return image;
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

  const debugTargets: DebugTarget[] = [];

  // A fixed sunset image sits behind all parallax scenery and never scrolls
  // or repeats; it covers exactly the viewport, not the whole world.
  const sky = scene.add
    .image(0, backgroundLayout.sky.baselineY, backgroundLayout.sky.key)
    .setOrigin(0, 1)
    .setDisplaySize(backgroundLayout.sky.targetWidth, backgroundLayout.sky.targetHeight)
    .setScrollFactor(0);
  debugTargets.push({ name: 'sky', object: sky });

  // City skyline and the mid-buildings texture are full-level parallax
  // layers: their scroll factor is derived from how far the (uniformly
  // height-scaled) texture can travel relative to how far the camera
  // travels across the whole level.
  const city = createBackgroundImage(scene, backgroundLayout.city);
  const cityScrollFactor = Phaser.Math.Clamp(
    (city.displayWidth - DESIGN_WIDTH) / (WORLD_WIDTH - DESIGN_WIDTH),
    0,
    1,
  );
  city.setScrollFactor(cityScrollFactor, 0);
  debugTargets.push({ name: 'city', object: city });

  // The railway and both trains are world-aligned (default scrollFactor 1,
  // no parallax lag), positioned relative to FIRST_RAILWAY_START_X so the
  // whole section can be relocated by changing that one constant.
  const sectionStartX = backgroundLayout.railwaySection.startX;
  const sectionWidth = backgroundLayout.railwaySection.sectionWidth;

  const railway = scene.add
    .image(sectionStartX, backgroundLayout.railwaySection.baselineY, backgroundLayout.railwaySection.key)
    .setOrigin(0, 1);
  railway.setScale(backgroundLayout.railwaySection.targetHeight / railway.height);
  debugTargets.push({ name: 'railway', object: railway });

  // Two trains that only ever traverse the first railway section, in
  // section-local coordinates: train-right runs from just off the
  // section's left edge to its right edge (sectionWidth), train-left runs
  // the mirror path. Both keep their original (cropped, unscaled) pixel size.
  const trainRight = scene.add
    .image(0, backgroundLayout.trains.baselineY, backgroundLayout.trains.right.key)
    .setOrigin(0, 1);
  trainRight.x = sectionStartX - trainRight.displayWidth;
  debugTargets.push({ name: 'train-right', object: trainRight });

  scene.tweens.add({
    targets: trainRight,
    x: sectionStartX + sectionWidth,
    duration: backgroundLayout.trains.durationMs,
    ease: backgroundLayout.trains.ease,
    repeat: -1,
    repeatDelay: backgroundLayout.trains.repeatDelay,
  });

  const trainLeft = scene.add
    .image(0, backgroundLayout.trains.baselineY, backgroundLayout.trains.left.key)
    .setOrigin(0, 1);
  trainLeft.x = sectionStartX + sectionWidth;
  debugTargets.push({ name: 'train-left', object: trainLeft });

  scene.tweens.add({
    targets: trainLeft,
    x: sectionStartX - trainLeft.displayWidth,
    duration: backgroundLayout.trains.durationMs,
    ease: backgroundLayout.trains.ease,
    repeat: -1,
    repeatDelay: backgroundLayout.trains.repeatDelay,
  });

  // Mid-background building row: a single non-tiled texture replacing the
  // procedural building rectangles and their nested window rectangles that
  // used to be drawn here.
  const houses = createBackgroundImage(scene, backgroundLayout.houses);
  const cameraTravel = Math.max(1, WORLD_WIDTH - DESIGN_WIDTH);
  const textureTravel = Math.max(0, houses.displayWidth - DESIGN_WIDTH);
  const housesScrollFactor = Phaser.Math.Clamp(textureTravel / cameraTravel, 0, 1);
  houses.setScrollFactor(housesScrollFactor, 0);
  debugTargets.push({ name: 'houses', object: houses });

  const backgroundObjects = {
    sky,
    city,
    trainLeft,
    trainRight,
    railway,
    houses,
  };

  BACKGROUND_ORDER.forEach((name, index) => {
    const object = backgroundObjects[name];
    object.setDepth(index);
    layers.midBackground.add(object);
  });

  // Asphalt is drawn per ground segment (not the full world) so it stops exactly
  // at each pit boundary, matching the physics ground colliders in BerlinScene.
  const { asphaltColor, voidColor, asphaltHeight, asphaltOffsetY, pitHeight, pitOffsetY, depth: groundDepth } =
    backgroundLayout.ground;
  GROUND_SEGMENTS.forEach((segment) => {
    rectangle(
      layers.gameplay,
      (segment.startX + segment.endX) / 2,
      GROUND_Y + asphaltOffsetY,
      segment.endX - segment.startX,
      asphaltHeight,
      asphaltColor,
      groundDepth,
      1,
    );
  });

  // A dark void fills each pit range, and jagged "teeth" break up the asphalt
  // edges on either side so the gap reads clearly before the player reaches it.
  PIT_ZONES.forEach((pit) => {
    rectangle(
      layers.gameplay,
      (pit.startX + pit.endX) / 2,
      GROUND_Y + pitOffsetY,
      pit.endX - pit.startX,
      pitHeight,
      voidColor,
      groundDepth,
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
          depth: groundDepth,
          scrollFactorX: 1,
        });
      }
    });
  });

  if (isBackgroundDebugEnabled()) {
    attachBackgroundDebug(scene, debugTargets);
  }
}
