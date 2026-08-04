import Phaser from 'phaser';
import {
  Depth,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  GROUND_Y,
  HIT_TIME,
  START_TIME,
  WORLD_WIDTH,
} from '../constants';
import { Player } from '../entities/Player';
import { BERLIN_SECTIONS } from '../level/berlin/berlinLevelConfig';
import { applyCollectibleReward, canFinishBerlin } from '../level/berlin/berlinRules';
import { isCollectible, LevelBuilder, type BuiltBerlinLevel } from '../level/berlin/LevelBuilder';
import type { BerlinEntity, CollectibleConfig } from '../level/berlin/types';
import { buildBerlinWorld } from '../level/berlinLevel';
import { createSceneLayers, type SceneLayers } from '../level/sceneLayers';
import { addFullscreenButton, OrientationController } from '../responsive/OrientationController';
import { BerlinScoreSystem } from '../systems/BerlinScoreSystem';
import { HudSystem } from '../systems/HudSystem';
import { LayerDebugSystem } from '../systems/LayerDebugSystem';
import { SectionTracker } from '../systems/SectionTracker';
import type { BerlinProgress } from '../types/game';

export class BerlinScene extends Phaser.Scene {
  private player!: Player;
  private hud!: HudSystem;
  private progress!: BerlinProgress;
  private intro!: Phaser.GameObjects.Container;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private space!: Phaser.Input.Keyboard.Key;
  private duckKey!: Phaser.Input.Keyboard.Key;
  private debugKey?: Phaser.Input.Keyboard.Key;
  private invulnerable = false;
  private layers!: SceneLayers;
  private level!: BuiltBerlinLevel;
  private readonly scoreSystem = new BerlinScoreSystem();
  private readonly sections = new SectionTracker();
  private layerDebug?: LayerDebugSystem;
  private debugOverlay?: Phaser.GameObjects.Container;

  constructor() {
    super('BerlinScene');
  }

  create(): void {
    this.progress = { state: 'intro', seconds: START_TIME, score: 0, hasUsb: false };
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, DESIGN_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, DESIGN_HEIGHT).setBackgroundColor('#2a1742');
    this.layers = createSceneLayers(this);
    buildBerlinWorld(this, this.layers);
    const ground = this.add.zone(WORLD_WIDTH / 2, GROUND_Y + 10, WORLD_WIDTH, 20);
    this.physics.add.existing(ground, true);
    this.player = new Player(this, 230);
    this.layers.gameplay.add(this.player);
    this.physics.add.collider(this.player, ground);
    this.level = new LevelBuilder(this, this.layers.gameplay).build();
    this.physics.add.overlap(this.player, this.level.obstacles, (_player, zone) =>
      this.hitObstacle(zone as Phaser.GameObjects.Zone),
    );
    this.physics.add.overlap(this.player, this.level.collectibles, (_player, zone) =>
      this.collect(zone as Phaser.GameObjects.Zone),
    );
    this.physics.add.overlap(this.player, this.level.finish, () => this.finish());
    this.hud = new HudSystem(
      this,
      () => this.action(),
      (pressed) => this.setDuck(pressed),
      this.layers.ui,
    );
    this.hud.update(this.progress);
    this.createIntro();
    new OrientationController(this, {
      onPause: () => this.physics.pause(),
      onResume: () => this.physics.resume(),
      onLayout: (viewport) => this.hud.applyLayout(viewport),
    });
    this.keys = this.input.keyboard!.createCursorKeys();
    this.space = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.duckKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1, -260, 0).setLerp(0.08, 0.08);
    if (import.meta.env.DEV) this.createDevelopmentTools();
  }

  private createIntro(): void {
    const panel = this.add.rectangle(0, 0, 650, 340, 0x0d0916, 0.94).setStrokeStyle(5, 0xff5e3c);
    const text = this.add
      .text(
        0,
        0,
        'INCOMING CALL\n\nDUDE, WHERE ARE YOU?\nYOU’RE PLAYING NEXT.\n\nSPACE / ↑  JUMP     S / ↓  DUCK\nPRESS SPACE OR TAP JUMP TO START',
        {
          fontFamily: 'Space Mono',
          fontSize: '23px',
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
    if (fullscreen) {
      fullscreen.setPosition(0, 142);
      this.intro.add(fullscreen);
    }
  }

  private action(): void {
    if (this.progress.state === 'intro') {
      this.progress.state = 'running';
      this.intro.destroy();
      this.hud.flash(BERLIN_SECTIONS[0].label, 900);
    } else if (this.progress.state === 'running') this.player.requestJump(this.time.now);
    else if (this.progress.state === 'gameOver') this.scene.restart();
  }

  private setDuck(pressed: boolean): void {
    if (this.progress.state === 'running') this.player.setCrouched(pressed);
  }

  private hitObstacle(zone: Phaser.GameObjects.Zone): void {
    if (this.invulnerable || this.progress.state !== 'running') return;
    const config = zone.getData('config') as BerlinEntity;
    this.invulnerable = true;
    this.sections.markDamage();
    this.scoreSystem.hitObstacle();
    this.progress.seconds = Math.max(0, this.progress.seconds - HIT_TIME);
    this.syncScore();
    this.hud.flash(`HIT ${config.id.toUpperCase()}\n-${HIT_TIME} SEC  -100`);
    this.player.hurt();
    this.player.setTintFill(0xff3d66);
    this.cameras.main.flash(100, 255, 58, 92).shake(160, 0.008);
    this.time.delayedCall(1000, () => {
      this.invulnerable = false;
      this.player.clearTint();
    });
    if (this.progress.seconds <= 0) this.gameOver();
  }

  private collect(zone: Phaser.GameObjects.Zone): void {
    const config = zone.getData('config') as BerlinEntity;
    if (!isCollectible(config) || !zone.active) return;
    const artwork = zone.getData('artwork') as Phaser.GameObjects.Container;
    zone.destroy();
    artwork.destroy();
    this.applyCollectible(config);
  }

  private applyCollectible(config: CollectibleConfig): void {
    const reward = applyCollectibleReward(this.progress.seconds, this.progress.hasUsb, config);
    this.scoreSystem.addCollectible(reward.score);
    this.progress.seconds = reward.seconds;
    this.progress.hasUsb = reward.hasUsb;
    this.syncScore();
    const bonus = config.timeBonus ? `+${config.timeBonus} SEC` : `+${config.score}`;
    this.hud.flash(`${config.label}  ${bonus}`, 900);
  }

  private finish(): void {
    if (this.progress.state !== 'running') return;
    if (!canFinishBerlin(this.progress.hasUsb)) {
      this.hud.flash('YOU FORGOT THE USB', 1800);
      return;
    }
    this.progress.state = 'won';
    this.progress.score = this.scoreSystem.finish(this.progress.seconds);
    this.player.halt();
    this.physics.pause();
    this.hud.update(this.progress);
    this.hud.flash(
      `YOU MADE IT\nTIME BONUS  ${this.scoreSystem.breakdown.timeBonus}\nFINAL SCORE  ${this.progress.score}`,
      1800,
    );
    this.time.delayedCall(2200, () =>
      this.scene.start('RhythmScene', { score: this.progress.score }),
    );
  }

  private gameOver(): void {
    if (this.progress.state === 'gameOver') return;
    this.progress.state = 'gameOver';
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
        'YOU MISSED YOUR SET\n\nPRESS SPACE OR TAP JUMP TO RESTART',
        { fontFamily: 'Archivo Black', fontSize: '34px', color: '#ff5b49', align: 'center' },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(Depth.UI);
    this.layers.ui.add([background, text]);
  }

  private createDevelopmentTools(): void {
    this.layerDebug = new LayerDebugSystem(this, this.layers);
    this.debugKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    const graphics = this.add
      .graphics()
      .setDepth(Depth.UI - 1)
      .setScrollFactor(1);
    graphics.lineStyle(2, 0x53ffe0, 0.85);
    BERLIN_SECTIONS.forEach((section) =>
      graphics.lineBetween(section.startX, 0, section.startX, DESIGN_HEIGHT),
    );
    this.level.entities.forEach(({ zone }) =>
      graphics.strokeRect(
        zone.x - zone.width / 2,
        zone.y - zone.height / 2,
        zone.width,
        zone.height,
      ),
    );
    const status = this.add
      .text(18, 130, '', {
        fontFamily: 'Space Mono',
        fontSize: '14px',
        color: '#53ffe0',
        backgroundColor: '#120b1ddd',
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(Depth.UI);
    this.debugOverlay = this.add.container(0, 0, [graphics, status]).setVisible(false);
    [1, 2, 3, 4, 5].forEach((_number, index) => {
      const key = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE + index);
      key.on('down', (event: KeyboardEvent) => {
        if (event.shiftKey) this.player.setX(BERLIN_SECTIONS[index].startX + 80);
      });
    });
  }

  private updateDebug(): void {
    if (!this.debugOverlay?.visible) return;
    const status = this.debugOverlay.list.find(
      (item) => item instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text | undefined;
    status?.setText(
      `STATE ${this.player.animationState}\nSECTION ${BERLIN_SECTIONS[this.sections.index].id}\nX ${Math.round(this.player.x)}  TIME ${this.progress.seconds.toFixed(1)}\nSCORE ${this.progress.score}  USB ${this.progress.hasUsb ? 'YES' : 'NO'}`,
    );
  }

  private syncScore(): void {
    this.progress.score = this.scoreSystem.score;
    this.hud.update(this.progress);
  }

  update(_time: number, delta: number): void {
    this.layerDebug?.update();
    if (this.debugKey && Phaser.Input.Keyboard.JustDown(this.debugKey))
      this.debugOverlay?.setVisible(!this.debugOverlay.visible);
    this.updateDebug();
    if (Phaser.Input.Keyboard.JustDown(this.space) || Phaser.Input.Keyboard.JustDown(this.keys.up))
      this.action();
    if (this.progress.state !== 'running') return;
    this.setDuck(this.duckKey.isDown || this.keys.down.isDown);
    this.player.run(this.time.now);
    this.progress.seconds = Math.max(0, this.progress.seconds - delta / 1000);
    const transition = this.sections.update(this.player.x);
    if (transition.changed) {
      if (transition.clean) this.scoreSystem.awardCleanSection();
      this.syncScore();
      this.hud.flash(`${transition.label}${transition.clean ? '\nCLEAN +250' : ''}`, 900);
    }
    this.hud.update(this.progress);
    if (this.progress.seconds <= 0) this.gameOver();
  }
}
