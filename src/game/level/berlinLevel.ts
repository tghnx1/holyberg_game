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
  'trainRight',
  'trainLeft',
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

export interface BuiltBerlinWorld {
  /** Starts both train tweens; safe to call more than once. */
  startTrains: () => void;
}

export function buildBerlinWorld(scene: Phaser.Scene, layers: SceneLayers): BuiltBerlinWorld {
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

  // The railway is centred on the level: its own width leaves an equal
  // margin at each end. Widening or narrowing it in backgroundLayout keeps
  // it centred without touching a separate start-x constant.
  const railwayLayout = backgroundLayout.railwaySection;
  const railwayStartX = (WORLD_WIDTH - railwayLayout.width) / 2 - 400;
  const railway = scene.add
    .image(railwayStartX, railwayLayout.baselineY, railwayLayout.key)
    .setOrigin(0, 1);
  railway.setDisplaySize(railwayLayout.width, railwayLayout.targetHeight);
  railway.setScrollFactor(railwayLayout.scrollFactorX, 0);
  debugTargets.push({ name: 'railway', object: railway });

  // Two trains crossing the first railway section, both keeping their
  // original (cropped, unscaled) pixel size. Each one starts at an explicit
  // world x and tweens to the x at which it has fully cleared the opposite
  // side of the opening viewport.
  interface TrainLayout {
    key: string;
    startX: number;
    initialDelayMs: number;
    /** -1 loops forever; 0 runs the pass exactly once. */
    repeat: number;
    repeatDelayMs: number;
    /** Overrides backgroundLayout.trains.speed for this train only. */
    speed?: number;
    /**
     * When set, the first pass runs once from `startX` and every later pass
     * re-enters from here instead — e.g. the far end of the level. `repeat`
     * then applies to those later passes.
     */
    loopStartX?: number;
  }

  // Trains are built paused and held at their start x; BerlinScene calls
  // startTrains() the first time the player moves. initialDelayMs stays the
  // tween's `delay`, so it only begins counting from that moment.
  const trainTweens: Phaser.Tweens.Tween[] = [];

  const addTrain = (
    layout: TrainLayout,
    name: string,
    /** Given the sprite's own width, the x it should finish at. */
    resolveEndX: (displayWidth: number) => number,
  ): Phaser.GameObjects.Image => {
    const train = scene.add
      .image(layout.startX, backgroundLayout.trains.baselineY, layout.key)
      .setOrigin(0, 1);
    debugTargets.push({ name, object: train });

    const endX = resolveEndX(train.displayWidth);
    const speed = layout.speed ?? backgroundLayout.trains.speed;

    // Duration comes from the distance the train actually covers, so the
    // train holds its speed regardless of sprite width or how far apart
    // start and end are.
    const passFrom = (fromX: number, repeat: number, delay: number) =>
      scene.tweens.add({
        targets: train,
        x: { from: fromX, to: endX },
        duration: (Math.abs(endX - fromX) / speed) * 1000,
        ease: backgroundLayout.trains.ease,
        delay,
        repeat,
        repeatDelay: layout.repeatDelayMs,
        paused: true,
      });

    // With loopStartX the run is two tweens: one pass from startX, then a
    // separate tween that keeps re-entering from loopStartX. Only the first
    // is registered with startTrains(); the second is chained off it.
    const loopPass =
      layout.loopStartX === undefined
        ? undefined
        : passFrom(layout.loopStartX, layout.repeat, layout.repeatDelayMs);

    const firstPass = passFrom(
      layout.startX,
      loopPass ? 0 : layout.repeat,
      layout.initialDelayMs,
    );
    if (loopPass) firstPass.on('complete', () => loopPass.play());

    trainTweens.push(firstPass);

    return train;
  };

  // Runs right-to-left, ending once its right edge is past world x 0.
  const trainRight = addTrain(
    backgroundLayout.trains.right,
    'train-right',
    (displayWidth) => -displayWidth,
  );

  // Runs left-to-right, ending once it reaches the far edge of the level.
  const trainLeft = addTrain(backgroundLayout.trains.left, 'train-left', () => WORLD_WIDTH);

  // Mid-background houses: separate cutouts, world-aligned (scrollFactor 1)
  // like the railway. Each one is bottom-anchored to the shared baseline;
  // `anchor` decides whether its x is the left or the right edge.
  const houses = backgroundLayout.houses.items.map((item) => {
    const house = scene.add
      .image(item.x, backgroundLayout.houses.baselineY, item.key)
      .setOrigin(item.anchor === 'right' ? 1 : 0, 1);
    house.setScrollFactor(1, 0);
    debugTargets.push({ name: item.name, object: house });
    return house;
  });

  // The first house is the reference: `scale` sizes it, and every other
  // house is scaled to match that rendered height. Source textures can then
  // differ in pixel size without the houses coming out different sizes.
  const referenceHouse = houses[0];
  if (referenceHouse) {
    const referenceHeight = referenceHouse.height * backgroundLayout.houses.scale;
    for (const house of houses) house.setScale(referenceHeight / house.height);
  }

  const backgroundObjects = {
    sky,
    city,
    trainLeft,
    trainRight,
    railway,
    houses,
  };

  // One entry may hold several images (the houses); they share its depth slot.
  BACKGROUND_ORDER.forEach((name, index) => {
    const entry = backgroundObjects[name];
    for (const object of Array.isArray(entry) ? entry : [entry]) {
      object.setDepth(index);
      layers.midBackground.add(object);
    }
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

  return {
    startTrains: () => {
      for (const tween of trainTweens) {
        if (tween.paused) tween.play();
      }
    },
  };
}
