import Phaser from 'phaser';
import { Depth } from '../constants';

export type WorldLayerName =
  | 'sky'
  | 'farBackground'
  | 'midBackground'
  | 'environment'
  | 'gameplay'
  | 'foreground';

export type SceneLayerName = WorldLayerName | 'ui';

export interface LayerConfig {
  name: SceneLayerName;
  label: string;
  depth: number;
  scrollFactorX: number;
}

export interface SceneLayers {
  sky: Phaser.GameObjects.Layer;
  farBackground: Phaser.GameObjects.Layer;
  midBackground: Phaser.GameObjects.Layer;
  environment: Phaser.GameObjects.Layer;
  gameplay: Phaser.GameObjects.Layer;
  foreground: Phaser.GameObjects.Layer;
  ui: Phaser.GameObjects.Layer;
}

export const WORLD_LAYER_NAMES: readonly WorldLayerName[] = [
  'sky',
  'farBackground',
  'midBackground',
  'environment',
  'gameplay',
  'foreground',
];

export function getLayerConfiguration(): readonly LayerConfig[] {
  return [
    { name: 'sky', label: 'Sky', depth: Depth.SKY, scrollFactorX: 0 },
    {
      name: 'farBackground',
      label: 'FarBackground',
      depth: Depth.FAR_BACKGROUND,
      scrollFactorX: 0.18,
    },
    {
      name: 'midBackground',
      label: 'MidBackground',
      depth: Depth.MID_BACKGROUND,
      scrollFactorX: 0.4,
    },
    {
      name: 'environment',
      label: 'Environment',
      depth: Depth.ENVIRONMENT,
      scrollFactorX: 0.72,
    },
    { name: 'gameplay', label: 'Gameplay', depth: Depth.GAMEPLAY, scrollFactorX: 1 },
    {
      name: 'foreground',
      label: 'Foreground',
      depth: Depth.FOREGROUND,
      scrollFactorX: 1.08,
    },
    { name: 'ui', label: 'UI', depth: Depth.UI, scrollFactorX: 0 },
  ];
}

export function createSceneLayers(scene: Phaser.Scene): SceneLayers {
  const layers = {} as SceneLayers;
  for (const config of getLayerConfiguration()) {
    layers[config.name] = scene.add.layer().setDepth(config.depth);
  }
  return layers;
}
