import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', async () => {
  const { EventEmitter } = await import('node:events');
  class Zone extends EventEmitter {
    width = 0;
    height = 0;
    input = { hitArea: { width: 0, height: 0 } };
    setOrigin() { return this; }
    setDepth() { return this; }
    setInteractive() { return this; }
    setSize(width: number, height: number) {
      this.width = width;
      this.height = height;
      this.input.hitArea = { width, height };
      return this;
    }
    destroy() { this.removeAllListeners(); }
  }
  class Scene {
    cameras = { main: { width: 960, height: 720 } };
    input = { addPointer: vi.fn() };
    add = { zone: () => new Zone() };
  }
  return { default: { Scene, Input: { Keyboard: { KeyCodes: { A: 65, D: 68 } } } } };
});
import Phaser from 'phaser';
import { BossInput } from '../src/game/boss/BossInput';

describe('Boss touch controls resize', () => {
  it('expands its hit area and releases stale holds when the camera widens', () => {
    // Given an existing touch zone and held left pointer.
    const scene = new Phaser.Scene('test');
    const createZone = vi.spyOn(scene.add, 'zone');
    const controls = new BossInput(scene, true);
    const zone = createZone.mock.results[0].value;
    zone.emit('pointerdown', { id: 1, x: 100 });
    expect(controls.direction).toBe(-1);
    scene.cameras.main.width = 1558;
    // When controls reflow to the wider camera.
    controls.resize();
    // Then the new right-hand space receives touches and old holds are cleared.
    expect(controls.direction).toBe(0);
    expect(zone.input.hitArea.width).toBe(1558);
    zone.emit('pointerdown', { id: 2, x: 1500 });
    expect(controls.direction).toBe(1);
    controls.destroy();
    expect(controls.direction).toBe(0);
  });
});
