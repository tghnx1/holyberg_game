import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './constants';
import { BerlinScene } from './scenes/BerlinScene';
import { BootScene } from './scenes/BootScene';
import { ResultScene } from './scenes/ResultScene';
import { RhythmScene } from './scenes/RhythmScene';

export const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  backgroundColor: '#10091d',
  pixelArt: false,
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1550 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, BerlinScene, RhythmScene, ResultScene],
};
