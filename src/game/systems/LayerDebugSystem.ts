import Phaser from 'phaser';
import { Depth } from '../constants';
import {
  getLayerConfiguration,
  WORLD_LAYER_NAMES,
  type SceneLayers,
} from '../level/sceneLayers';

export class LayerDebugSystem {
  private readonly panel: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layers: SceneLayers,
  ) {
    this.panel = scene.add
      .text(18, 120, '', {
        fontFamily: 'Space Mono',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#090611dd',
        padding: { x: 12, y: 10 },
        lineSpacing: 4,
      })
      .setScrollFactor(0)
      .setDepth(Depth.UI + 1)
      .setVisible(false);
    layers.ui.add(this.panel);

    scene.input.keyboard?.on('keydown-L', () => this.panel.setVisible(!this.panel.visible));
    WORLD_LAYER_NAMES.forEach((name, index) => {
      scene.input.keyboard?.on(`keydown-${index + 1}`, () => {
        this.layers[name].setVisible(!this.layers[name].visible);
      });
    });
  }

  update(): void {
    if (!this.panel.visible) return;
    const rows = getLayerConfiguration().map((config) => {
      const visibility = this.layers[config.name].visible ? 'ON ' : 'OFF';
      return `${config.label.padEnd(14)} ${visibility}  x${config.scrollFactorX}`;
    });
    this.panel.setText(`LAYERS  cameraX ${Math.round(this.scene.cameras.main.scrollX)}\n${rows.join('\n')}`);
  }
}
