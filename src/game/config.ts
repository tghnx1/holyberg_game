import Phaser from 'phaser';
import { DESIGN_HEIGHT } from './constants';
import { BerlinScene } from './scenes/BerlinScene';
import { BossScene } from './scenes/BossScene';
import { ClubScene } from './scenes/ClubScene';
import { DialogueScene } from './scenes/DialogueScene';
import { LevelCompleteScene } from './scenes/LevelCompleteScene';
import { BootScene } from './scenes/BootScene';
import { ResultScene } from './scenes/ResultScene';
import { RhythmScene } from './scenes/RhythmScene';

export const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  // Explicit target: without it Phaser creates its own wrapper div and moves
  // the canvas into it, so the element it goes fullscreen with is not the one
  // ScaleManager measures for parentSize. Naming #game keeps both the same.
  fullscreenTarget: 'game',
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
  // Nothing behind the canvas is ever meant to show through, so an opaque
  // context lets the compositor skip blending the game against the page.
  transparent: false,
  render: {
    powerPreference: 'high-performance',
    transparent: false,
  },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1550 }, debug: false } },
  // zoom 1 keeps the drawing buffer the same size as the CSS box: Phaser 3
  // does not scale by devicePixelRatio, so this is a 1:1 backing store and a
  // phone renders the same pixel count as a desktop at the same CSS size.
  scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH, zoom: 1 },
  scene: [BootScene, BerlinScene, LevelCompleteScene, DialogueScene, ClubScene, RhythmScene, BossScene, ResultScene],
};
