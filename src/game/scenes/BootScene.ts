import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.image('berlin-sky', 'assets/backgrounds/sky.png');
  }

  create(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0x17101f).fillRoundedRect(0, 0, 80, 98, 18);
    graphics.fillStyle(0xff713c).fillCircle(40, 26, 21);
    graphics.fillStyle(0x21182d).fillCircle(40, 26, 12);
    graphics.fillStyle(0x15121d).fillRect(23, 45, 34, 40);
    graphics.fillStyle(0xffc74e).fillRect(13, 50, 12, 32);
    graphics.generateTexture('dj', 80, 98);
    graphics.destroy();

    const developmentScene = new URLSearchParams(window.location.search).get('scene');
    if (import.meta.env.DEV && developmentScene === 'rhythm') {
      this.scene.start('RhythmScene', { score: 500 });
      return;
    }
    this.scene.start('BerlinScene');
  }
}
