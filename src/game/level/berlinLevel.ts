import Phaser from 'phaser';
import { Depth, GROUND_Y, WORLD_WIDTH } from '../constants';
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

function configure<T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth & Phaser.GameObjects.Components.ScrollFactor>(
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
  const { scene, layer, x, y, width, height, color, depth, scrollFactorX, scrollFactorY } =
    options;
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
  const { scene, layer, x, y, width, height, color, depth, scrollFactorX, scrollFactorY } =
    options;
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

function addText(
  options: Omit<ShapeOptions, 'color'> & {
    text: string;
    style: Phaser.Types.GameObjects.Text.TextStyle;
  },
): Phaser.GameObjects.Text {
  const { scene, layer, x, y, text, style, depth, scrollFactorX, scrollFactorY } = options;
  return configure(
    scene.add.text(x, y, text, style),
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

  // A fixed sky canvas lets each district tint sit behind all parallax scenery.
  rectangle(layers.sky, 3000, 300, 6000, 620, 0x2a1742, Depth.SKY, 0);
  rectangle(layers.sky, 3350, 300, 1900, 620, 0x502159, Depth.SKY, 0);
  rectangle(layers.sky, 5150, 300, 1700, 620, 0x121021, Depth.SKY, 0);
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

  // Apartment and street façades.
  rectangle(layers.environment, 400, 360, 800, 500, 0x2a1738, Depth.ENVIRONMENT, 0.75);
  rectangle(layers.environment, 130, 530, 210, 65, 0x5c365f, Depth.ENVIRONMENT, 0.75);
  rectangle(layers.environment, 130, 492, 160, 25, 0x9b6382, Depth.ENVIRONMENT, 0.75);
  rectangle(layers.environment, 410, 520, 170, 90, 0x44263e, Depth.ENVIRONMENT, 0.75);
  rectangle(layers.environment, 410, 470, 130, 22, 0xe8a22c, Depth.ENVIRONMENT, 0.75);
  rectangle(layers.environment, 650, 360, 150, 200, 0x713557, Depth.ENVIRONMENT, 0.75);
  rectangle(layers.environment, 650, 360, 120, 165, 0x221b45, Depth.ENVIRONMENT, 0.75);
  addText({
    scene,
    layer: layers.environment,
    x: 650,
    y: 575,
    text: 'EXIT',
    style: { fontFamily: 'Space Mono', fontSize: '15px', color: '#ffca57' },
    depth: Depth.ENVIRONMENT,
    scrollFactorX: 0.75,
  }).setOrigin(0.5);

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
  addText({
    scene,
    layer: layers.environment,
    x: 1120,
    y: 300,
    text: 'SPÄTI',
    style: {
      fontFamily: 'Archivo Black',
      fontSize: '42px',
      color: '#ffdf55',
      backgroundColor: '#e93c54',
    },
    depth: Depth.ENVIRONMENT,
    scrollFactorX: 0.75,
  }).setOrigin(0.5);

  // The bridge section uses distinct factors from skyline to foreground railing.
  rectangle(layers.midBackground, 3350, 540, 1900, 140, 0x34235d, Depth.MID_BACKGROUND, 0.35);
  for (let x = 2520; x < 4250; x += 230) {
    addEllipse({ scene, layer: layers.midBackground, x, y: 505, width: 210, height: 150, color: 0x8f3f59, depth: Depth.MID_BACKGROUND, scrollFactorX: 0.55 });
    addEllipse({ scene, layer: layers.midBackground, x, y: 520, width: 160, height: 120, color: 0x34235d, depth: Depth.MID_BACKGROUND, scrollFactorX: 0.55 });
    rectangle(layers.midBackground, x, 510, 18, 150, 0x73314b, Depth.MID_BACKGROUND, 0.55);
  }
  for (const x of [2640, 4070]) {
    rectangle(layers.environment, x, 365, 115, 290, 0x7d3e52, Depth.ENVIRONMENT, 0.72);
    addTriangle({ scene, layer: layers.environment, x, y: 175, points: [0, 110, 58, 0, 116, 110], color: 0xa54954, depth: Depth.ENVIRONMENT, scrollFactorX: 0.72 });
  }
  rectangle(layers.environment, 3360, 410, 1100, 35, 0xf0bd38, Depth.ENVIRONMENT, 0.78);
  addText({
    scene,
    layer: layers.environment,
    x: 3360,
    y: 408,
    text: 'U  U  U  U  U  U  U  U  U',
    style: { fontFamily: 'Space Mono', fontSize: '19px', color: '#171221' },
    depth: Depth.ENVIRONMENT,
    scrollFactorX: 0.78,
  }).setOrigin(0.5);

  // Club exterior and nearby buildings.
  for (let x = 4380; x < 6000; x += 260) {
    rectangle(layers.midBackground, x, 390, 230, 440, x % 520 ? 0x19172a : 0x24132e, Depth.MID_BACKGROUND, 0.5);
    rectangle(layers.environment, x, 350, 150, 8, x % 520 ? 0xe94373 : 0x8a41ff, Depth.ENVIRONMENT, 0.75);
  }
  addText({ scene, layer: layers.environment, x: 4950, y: 360, text: 'HOLYBERG', style: { fontFamily: 'Archivo Black', fontSize: '58px', color: '#ff3e68', stroke: '#7128b8', strokeThickness: 5 }, depth: Depth.ENVIRONMENT, scrollFactorX: 0.75 }).setOrigin(0.5);
  rectangle(layers.environment, 5740, 485, 170, 250, 0x08070c, Depth.ENVIRONMENT, 0.75);
  rectangle(layers.environment, 5740, 370, 210, 35, 0xec315f, Depth.ENVIRONMENT, 0.75);
  addText({ scene, layer: layers.environment, x: 5740, y: 370, text: 'BACKSTAGE', style: { fontFamily: 'Archivo Black', fontSize: '21px', color: '#fff' }, depth: Depth.ENVIRONMENT, scrollFactorX: 0.75 }).setOrigin(0.5);

  // Decorative near-camera elements never receive physics bodies.
  for (let x = 2460; x < 4320; x += 180) {
    rectangle(layers.foreground, x, 555, 8, 110, 0x17101f, Depth.FOREGROUND, 1.08);
    rectangle(layers.foreground, x + 90, 520, 180, 8, 0x17101f, Depth.FOREGROUND, 1.08);
  }
  for (const x of [980, 2250, 4450, 5480]) {
    rectangle(layers.foreground, x, 410, 12, 400, 0x14101d, Depth.FOREGROUND, 1.08);
    addCircle({ scene, layer: layers.foreground, x, y: 205, radius: 24, color: 0xffa65c, depth: Depth.FOREGROUND, scrollFactorX: 1.08 }).setAlpha(0.8);
  }

  rectangle(layers.gameplay, WORLD_WIDTH / 2, GROUND_Y + 55, WORLD_WIDTH, 110, 0x100c1b, Depth.GAMEPLAY, 1);
}
