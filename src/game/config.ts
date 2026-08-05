import Phaser from 'phaser';
import { DESIGN_HEIGHT } from './constants';
import { BerlinScene } from './scenes/BerlinScene';
import { BootScene } from './scenes/BootScene';
import { ResultScene } from './scenes/ResultScene';
import { RhythmScene } from './scenes/RhythmScene';

export const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  // Phaser.Scale.EXPAND recomputes size from these base dimensions on every
  // resize: it picks whichever axis has the smaller (parentSize / base) scale
  // factor to hold fixed and expands the other to fill the viewport. Using
  // DESIGN_HEIGHT as the base width (an assumed 1:1 floor) guarantees the
  // height stays pinned at DESIGN_HEIGHT for any viewport at least as wide as
  // it is tall — i.e. every desktop, tablet and landscape-phone aspect ratio
  // — while the width naturally comes out as DESIGN_HEIGHT * aspectRatio.
  width: DESIGN_HEIGHT,
  height: DESIGN_HEIGHT,
  backgroundColor: '#10091d',
  pixelArt: false,
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1550 }, debug: false } },
  scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, BerlinScene, RhythmScene, ResultScene],
};
