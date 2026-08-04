import Phaser from 'phaser';
import {
  Depth,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  GROUND_Y,
  START_TIME,
  WORLD_WIDTH,
} from '../constants';
import { Player } from '../entities/Player';
import { buildBerlinWorld } from '../level/berlinLevel';
import { createSceneLayers, type SceneLayers } from '../level/sceneLayers';
import { addFullscreenButton, OrientationController } from '../responsive/OrientationController';
import { HudSystem } from '../systems/HudSystem';
import { LayerDebugSystem } from '../systems/LayerDebugSystem';
import { ObstacleSystem } from '../systems/ObstacleSystem';
import {
  applyObstacle,
  collectUsb,
  initialProgress,
  startRun,
  tickTimer,
  tryFinish,
} from '../systems/gameRules';
import type { BerlinProgress } from '../types/game';

export class BerlinScene extends Phaser.Scene {
  private player!: Player;
  private hud!: HudSystem;
  private progress!: BerlinProgress;
  private intro!: Phaser.GameObjects.Container;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private space!: Phaser.Input.Keyboard.Key;
  private invulnerable = false;
  private usb!: Phaser.GameObjects.Container;
  private usbZone!: Phaser.GameObjects.Zone;
  private finishZone!: Phaser.GameObjects.Zone;
  private layers!: SceneLayers;
  private layerDebug?: LayerDebugSystem;

  constructor() {
    super('BerlinScene');
  }

  create(): void {
    this.progress = { ...initialProgress(), seconds: START_TIME };
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, DESIGN_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, DESIGN_HEIGHT);
    this.cameras.main.setBackgroundColor('#2a1742');

    this.layers = createSceneLayers(this);
    buildBerlinWorld(this, this.layers);

    const ground = this.add.zone(WORLD_WIDTH / 2, GROUND_Y + 10, WORLD_WIDTH, 20);
    this.physics.add.existing(ground, true);

    this.player = new Player(this, 230);
    this.player.setScrollFactor(1);
    this.layers.gameplay.add(this.player);
    this.physics.add.collider(this.player, ground);

    const obstacles = new ObstacleSystem(this, this.layers.gameplay);
    this.physics.add.overlap(this.player, obstacles.zones, () => this.hitObstacle());
    this.createUsb();
    this.createFinish();

    this.hud = new HudSystem(this, () => this.action(), this.layers.ui);
    this.hud.update(this.progress);
    this.createIntro();
    new OrientationController(this, {
      onPause: () => this.physics.pause(),
      onResume: () => this.physics.resume(),
      onLayout: (viewport) => this.hud.applyLayout(viewport),
    });

    this.keys = this.input.keyboard!.createCursorKeys();
    this.space = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.x < DESIGN_WIDTH - 180 || pointer.y < 520) this.action();
    });

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1, -260, 0);
    this.cameras.main.setLerp(0.08, 0.08);

    if (import.meta.env.DEV) this.layerDebug = new LayerDebugSystem(this, this.layers);
  }

  private createIntro(): void {
    const panel = this.add
      .rectangle(0, 0, 620, 310, 0x0d0916, 0.94)
      .setStrokeStyle(5, 0xff5e3c);
    const text = this.add
      .text(
        0,
        0,
        'INCOMING CALL\n\nDUDE, WHERE ARE YOU?\nYOU’RE PLAYING NEXT.\n\nPRESS SPACE OR TAP TO START',
        {
          fontFamily: 'Space Mono',
          fontSize: '25px',
          fontStyle: 'bold',
          color: '#fff',
          align: 'center',
          lineSpacing: 8,
        },
      )
      .setOrigin(0.5);
    this.intro = this.add
      .container(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, [panel, text])
      .setScrollFactor(0)
      .setDepth(Depth.UI);
    this.layers.ui.add(this.intro);
    const fullscreen = addFullscreenButton(this);
    if (fullscreen) { fullscreen.setPosition(0, 126); this.intro.add(fullscreen); }
  }

  private createUsb(): void {
    const body = this.add
      .rectangle(0, 0, 62, 26, 0xededed)
      .setStrokeStyle(3, 0x18111e);
    const plug = this.add.rectangle(39, 0, 20, 18, 0xaaa8b0);
    const label = this.add
      .text(-12, 0, 'USB', {
        fontFamily: 'Space Mono',
        fontSize: '12px',
        color: '#17111e',
      })
      .setOrigin(0.5);
    this.usb = this.add
      .container(520, GROUND_Y - 65, [body, plug, label])
      .setDepth(Depth.COLLECTIBLES)
      .setScrollFactor(1);
    this.layers.gameplay.add(this.usb);

    this.usbZone = this.add.zone(520, GROUND_Y - 65, 90, 70);
    this.physics.add.existing(this.usbZone, true);
    this.physics.add.overlap(this.player, this.usbZone, () => {
      if (this.progress.hasUsb) return;
      this.progress = collectUsb(this.progress);
      this.usb.destroy();
      this.usbZone.destroy();
      this.hud.flash('USB COLLECTED\nCAREER SAVED', 1700);
      this.hud.update(this.progress);
    });
    this.tweens.add({
      targets: this.usb,
      y: '-=10',
      yoyo: true,
      repeat: -1,
      duration: 600,
      ease: 'Sine.inOut',
    });
  }

  private createFinish(): void {
    this.finishZone = this.add.zone(5740, 480, 180, 260);
    this.physics.add.existing(this.finishZone, true);
    this.physics.add.overlap(this.player, this.finishZone, () => this.finish());
  }

  private action(): void {
    if (this.progress.state === 'intro') {
      this.progress = startRun(this.progress);
      this.intro.destroy();
      this.hud.flash('GET TO THE CLUB', 900);
      return;
    }
    if (this.progress.state === 'running') this.player.jump();
    else if (this.progress.state === 'gameOver') this.scene.restart();
  }

  private hitObstacle(): void {
    if (this.invulnerable || this.progress.state !== 'running') return;
    this.invulnerable = true;
    this.progress = applyObstacle(this.progress);
    this.hud.update(this.progress);
    this.hud.flash('-5 SECONDS');
    this.player.setTintFill(0xff3d66);
    this.cameras.main.shake(160, 0.008);
    this.time.delayedCall(1000, () => {
      this.invulnerable = false;
      this.player.clearTint();
    });
    if (this.progress.seconds === 0) this.gameOver();
  }

  private finish(): void {
    if (this.progress.state !== 'running') return;
    if (!this.progress.hasUsb) {
      this.hud.flash('YOU FORGOT THE USB', 1800);
      return;
    }
    this.progress = tryFinish(this.progress);
    this.player.halt();
    this.physics.pause();
    this.hud.flash(`YOU MADE IT\nFINAL SCORE  ${this.progress.score}`, 1800);
    this.time.delayedCall(2000, () =>
      this.scene.start('RhythmScene', { score: this.progress.score }),
    );
  }

  private gameOver(): void {
    if (this.progress.state !== 'gameOver') {
      this.progress = { ...this.progress, state: 'gameOver' };
    }
    this.player.halt();
    this.physics.pause();
    const background = this.add
      .rectangle(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, 680, 240, 0x0a0710, 0.94)
      .setScrollFactor(0)
      .setDepth(Depth.UI);
    const text = this.add
      .text(
        DESIGN_WIDTH / 2,
        DESIGN_HEIGHT / 2,
        'YOU MISSED YOUR SET\n\nPRESS SPACE OR TAP TO RESTART',
        {
          fontFamily: 'Archivo Black',
          fontSize: '34px',
          color: '#ff5b49',
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(Depth.UI);
    this.layers.ui.add([background, text]);
  }

  update(_time: number, delta: number): void {
    this.layerDebug?.update();
    if (
      Phaser.Input.Keyboard.JustDown(this.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.up)
    ) {
      this.action();
    }
    if (this.progress.state !== 'running') return;
    this.player.run();
    this.progress = tickTimer(this.progress, delta / 1000);
    this.hud.update(this.progress);
    if (this.progress.state === 'gameOver') this.gameOver();
  }
}
