import { describe, expect, it } from 'vitest';
import { getLayerConfiguration } from '../src/game/level/sceneLayers';

describe('scene layer configuration', () => {
  it('keeps world layers ordered from fixed sky to fast foreground', () => {
    const layers = getLayerConfiguration();
    expect(layers.map((layer) => layer.name)).toEqual([
      'sky',
      'farBackground',
      'midBackground',
      'environment',
      'gameplay',
      'foreground',
      'ui',
    ]);
    expect(layers.map((layer) => layer.depth)).toEqual([...layers.map((layer) => layer.depth)].sort((a, b) => a - b));
    expect(layers.find((layer) => layer.name === 'sky')?.scrollFactorX).toBe(0);
    expect(layers.find((layer) => layer.name === 'foreground')?.scrollFactorX).toBeGreaterThan(1);
    expect(layers.find((layer) => layer.name === 'ui')?.scrollFactorX).toBe(0);
  });
});
