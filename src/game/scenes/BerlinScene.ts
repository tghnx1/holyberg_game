import Phaser from 'phaser';
import {
  Depth,
  DESIGN_HEIGHT,
  GROUND_Y,
  HIT_TIME,
  START_TIME,
  WORLD_WIDTH,
} from '../constants';
import { Player } from '../entities/Player';
import {
  BERLIN_SECTIONS,
  CLUB_ENTRANCE_X,
  GROUND_SEGMENTS,
  PIT_ZONES,
} from '../level/berlin/berlinLevelConfig';
import { applyCollectibleReward } from '../level/berlin/berlinRules';
import {
  isCollectible,
  LevelBuilder,
  type BuiltBerlinLevel,
  type PendingActivation,
} from '../level/berlin/LevelBuilder';
import type { BerlinEntity, CollectibleConfig } from '../level/berlin/types';
import { buildBerlinWorld, type BuiltBerlinWorld } from '../level/berlinLevel';
import { createSceneLayers, type SceneLayers } from '../level/sceneLayers';
import { addFullscreenButton, OrientationController } from '../responsive/OrientationController';
import { BerlinScoreSystem } from '../systems/BerlinScoreSystem';
import { HudSystem } from '../systems/HudSystem';
import { LayerDebugSystem } from '../systems/LayerDebugSystem';
import { LevelEditorSystem } from '../systems/LevelEditorSystem';
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
  private touchDuckHeld = false;
  private finishTriggered = false;
  private trainsStarted = false;
  private world!: BuiltBerlinWorld;
  private layers!: SceneLayers;
  private level!: BuiltBerlinLevel;
  private levelBuilder!: LevelBuilder;
  /** Kept so the dev editor can drop an obstacle's overlap when deleting it. */
  private readonly obstacleColliders = new Map<
    Phaser.GameObjects.Zone,
    Phaser.Physics.Arcade.Collider
  >();
  private pendingActivations: PendingActivation[] = [];
  private readonly scoreSystem = new BerlinScoreSystem();
  private readonly sections = new SectionTracker();
  private layerDebug?: LayerDebugSystem;
  private editor?: LevelEditorSystem;
  private editorKey?: Phaser.Input.Keyboard.Key;
  private debugOverlay?: Phaser.GameObjects.Container;
  private debugGraphics?: Phaser.GameObjects.Graphics;
  private gameOverOverlay?: { background: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text };

  constructor() {
    super('BerlinScene');
  }

  create(): void {
    this.progress = { state: 'intro', seconds: START_TIME, score: 0, hasUsb: false };
    this.finishTriggered = false;
    this.trainsStarted = false;
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, DESIGN_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, DESIGN_HEIGHT).setBackgroundColor('#2a1742');
    this.layers = createSceneLayers(this);
    if (import.meta.env.DEV) console.debug('[BerlinScene] before buildBerlinWorld');
    this.world = buildBerlinWorld(this, this.layers);
    if (import.meta.env.DEV) console.debug('[BerlinScene] after buildBerlinWorld');
    if (import.meta.env.DEV) console.debug('[BerlinScene] before Player creation');
    this.player = new Player(this, 230);
    if (import.meta.env.DEV) console.debug('[BerlinScene] after Player creation');
    this.layers.gameplay.add(this.player);
    GROUND_SEGMENTS.forEach((segment) => {
      const ground = this.add.zone(
        (segment.startX + segment.endX) / 2,
        GROUND_Y + 10,
        segment.endX - segment.startX,
        20,
      );
      this.physics.add.existing(ground, true);
      this.physics.add.collider(this.player, ground);
    });
    PIT_ZONES.forEach((pit) => {
      const killZone = this.add.zone(
        (pit.startX + pit.endX) / 2,
        DESIGN_HEIGHT + 80,
        pit.endX - pit.startX,
        200,
      );
      this.physics.add.existing(killZone, true);
      this.physics.add.overlap(this.player, killZone, () => this.gameOver());
    });
    if (import.meta.env.DEV) console.debug('[BerlinScene] before LevelBuilder.build');
    this.levelBuilder = new LevelBuilder(this, this.layers.gameplay);
    this.level = this.levelBuilder.build();
    this.pendingActivations = this.level.pendingActivations;
    if (import.meta.env.DEV) console.debug('[BerlinScene] after LevelBuilder.build');
    if (import.meta.env.DEV) console.debug('[BerlinScene] before obstacle overlaps');
    this.level.entities
      .filter(({ config }) => config.type === 'obstacle')
      .forEach(({ zone }) => this.watchObstacle(zone));
    if (import.meta.env.DEV) console.debug('[BerlinScene] after obstacle overlaps');
    if (import.meta.env.DEV) console.debug('[BerlinScene] before platform colliders');
    this.physics.add.collider(
      this.player,
      this.level.platforms,
      undefined,
      (_player, platform) => this.canLandOnPlatform(platform as Phaser.GameObjects.Zone),
      this,
    );
    this.physics.add.collider(
      this.player,
      this.level.movingPlatforms,
      undefined,
      (_player, platform) => this.canLandOnPlatform(platform as Phaser.GameObjects.Zone),
      this,
    );
    if (import.meta.env.DEV) console.debug('[BerlinScene] after platform colliders');
    this.physics.add.overlap(this.player, this.level.collectibles, (_player, zone) =>
      this.collect(zone as Phaser.GameObjects.Zone),
    );
    this.physics.add.overlap(this.player, this.level.finish, () => this.finish());
    if (import.meta.env.DEV) console.debug('[BerlinScene] before HUD creation');
    this.hud = new HudSystem(
      this,
      () => this.action(),
      (pressed) => {
        this.touchDuckHeld = pressed;
      },
      this.layers.ui,
    );
    if (import.meta.env.DEV) console.debug('[BerlinScene] after HUD creation');
    this.hud.update(this.progress);
    this.createIntro();
    new OrientationController(this, {
      onPause: () => {
        // A touch-held duck can lose its pointerup while the device rotates
        // (finger position/target changes mid-gesture); force it to release
        // so input state is always clean when the overlay clears.
        this.touchDuckHeld = false;
        this.setDuck(false);
        this.physics.pause();
      },
      onResume: () => this.physics.resume(),
      onLayout: (viewport) => {
        this.hud.applyLayout(viewport);
        this.repositionOverlays();
      },
    });
    this.keys = this.input.keyboard!.createCursorKeys();
    this.space = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.duckKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.followPlayer();
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
    const camera = this.cameras.main;
    this.intro = this.add
      .container(camera.width / 2, camera.height / 2, [panel, text])
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
    if (this.progress.state === 'running' && !this.player.canAcceptHitInput(this.time.now)) return;
    if (this.progress.state === 'intro') {
      this.progress.state = 'running';
      this.intro.destroy();
      this.hud.flash(BERLIN_SECTIONS[0].label, 900);
    } else if (this.progress.state === 'running') this.player.requestJump(this.time.now);
    else if (this.progress.state === 'gameOver') this.scene.restart();
  }

  private setDuck(pressed: boolean): void {
    if (this.progress.state === 'running' && this.player.canAcceptHitInput(this.time.now))
      this.player.setCrouched(pressed);
  }

  private hitObstacle(zone: Phaser.GameObjects.Zone): void {
    if (this.invulnerable || this.progress.state !== 'running') return;
    const config = zone.getData('config') as BerlinEntity;
    if (zone.getData('alreadyHit')) return;
    zone.setData('alreadyHit', true);
    if (import.meta.env.DEV) console.debug('OBSTACLE HIT', config.id);
    const body = zone.body as Phaser.Physics.Arcade.Body | undefined;
    if (body) body.enable = false;
    this.invulnerable = true;
    this.sections.markDamage();
    this.scoreSystem.hitObstacle();
    this.progress.seconds = Math.max(0, this.progress.seconds - HIT_TIME);
    this.syncScore();
    this.hud.flash(`HIT ${config.id.toUpperCase()}\n-${HIT_TIME} SEC  -100`);
    this.player.hurt();
    this.player.startHitReaction(this.time.now);
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
    if (this.finishTriggered || this.progress.state !== 'running') return;
    this.finishTriggered = true;
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
    const camera = this.cameras.main;
    const cx = camera.width / 2;
    const cy = camera.height / 2;
    const background = this.add
      .rectangle(cx, cy, 680, 240, 0x0a0710, 0.94)
      .setScrollFactor(0)
      .setDepth(Depth.UI);
    const text = this.add
      .text(cx, cy, 'YOU MISSED YOUR SET\n\nPRESS SPACE OR TAP JUMP TO RESTART', {
        fontFamily: 'Archivo Black',
        fontSize: '34px',
        color: '#ff5b49',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(Depth.UI);
    this.gameOverOverlay = { background, text };
    this.layers.ui.add([background, text]);
  }

  private repositionOverlays(): void {
    const camera = this.cameras.main;
    const cx = camera.width / 2;
    const cy = camera.height / 2;
    if (this.intro?.active) this.intro.setPosition(cx, cy);
    if (this.gameOverOverlay) {
      this.gameOverOverlay.background.setPosition(cx, cy);
      this.gameOverOverlay.text.setPosition(cx, cy);
    }
  }

  private createDevelopmentTools(): void {
    this.layerDebug = new LayerDebugSystem(this, this.layers);
    const layoutEditor = new LevelEditorSystem(this, this.level.entities, {
      // Platforms and collectibles join groups the colliders already watch;
      // an obstacle needs its own overlap, exactly as create() registers it.
      spawn: (config) => {
        const built = this.levelBuilder.addEntity(config);
        if (config.type === 'obstacle') this.watchObstacle(built.zone);
        return built;
      },
      despawn: (zone) => {
        const collider = this.obstacleColliders.get(zone);
        if (collider) {
          this.physics.world.removeCollider(collider);
          this.obstacleColliders.delete(zone);
        }
        this.levelBuilder.removeEntity(zone);
      },
      releaseCamera: () => this.cameras.main.stopFollow(),
      restoreCamera: () => this.followPlayer(),
    });
    this.editor = layoutEditor;
    this.input.keyboard?.on('keydown-P', () => {
      layoutEditor.saveConfig();
    });
    this.editorKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.debugKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    this.debugGraphics = this.add
      .graphics()
      .setDepth(Depth.UI - 1)
      .setScrollFactor(1);
    this.debugGraphics.lineStyle(2, 0x53ffe0, 0.85);
    BERLIN_SECTIONS.forEach((section) =>
      this.debugGraphics?.lineBetween(section.startX, 0, section.startX, DESIGN_HEIGHT),
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
    this.debugOverlay = this.add.container(0, 0, [this.debugGraphics, status]).setVisible(false);
    this.add.text(6900, 395, 'PLATFORM ROUTE', {
      fontFamily: 'Archivo Black',
      fontSize: '18px',
      color: '#ffe36d',
      backgroundColor: '#1b1020cc',
      padding: { x: 8, y: 4 },
    }).setDepth(Depth.UI - 2);
    this.add.text(7600, 325, 'DOUBLE JUMP', {
      fontFamily: 'Archivo Black',
      fontSize: '18px',
      color: '#7ef0ff',
      backgroundColor: '#1b1020cc',
      padding: { x: 8, y: 4 },
    }).setDepth(Depth.UI - 2);
    this.add.text(8200, 350, 'BONUS ABOVE', {
      fontFamily: 'Archivo Black',
      fontSize: '18px',
      color: '#ff7ac1',
      backgroundColor: '#1b1020cc',
      padding: { x: 8, y: 4 },
    }).setDepth(Depth.UI - 2);
    [1, 2, 3, 4, 5].forEach((_number, index) => {
      const key = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE + index);
      key.on('down', (event: KeyboardEvent) => {
        if (event.shiftKey) this.player.setX(BERLIN_SECTIONS[index].startX + 80);
      });
    });
  }

  private updateDebug(): void {
    if (!this.debugOverlay?.visible) return;
    const graphics = this.debugGraphics;
    if (graphics) {
      graphics.clear();
      graphics.lineStyle(2, 0x53ffe0, 0.85);
      BERLIN_SECTIONS.forEach((section) =>
        graphics.lineBetween(section.startX, 0, section.startX, DESIGN_HEIGHT),
      );
      const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
      graphics.lineStyle(2, 0xff5e3c, 1);
      graphics.strokeRect(playerBody.x, playerBody.y, playerBody.width, playerBody.height);
      graphics.lineStyle(2, 0x53ffe0, 0.85);
      this.level.entities
        .filter(({ config }) => config.type === 'obstacle')
        .forEach(({ zone }) => {
          const body = zone.body as Phaser.Physics.Arcade.Body;
          graphics.strokeRect(body.x, body.y, body.width, body.height);
        });
    }
    const status = this.debugOverlay.list.find(
      (item) => item instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text | undefined;
    status?.setText(
      `STATE ${this.player.animationState}\nSECTION ${BERLIN_SECTIONS[this.sections.index].id}\nX ${Math.round(this.player.x)}  TIME ${this.progress.seconds.toFixed(1)}\nSCORE ${this.progress.score}  USB ${this.progress.hasUsb ? 'YES' : 'NO'}`,
    );
  }

  /** The gameplay camera: also used to undo the dev editor's free panning. */
  private followPlayer(): void {
    this.cameras.main.setZoom(1);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1, -260, 0).setLerp(0.08, 0.08);
  }

  private watchObstacle(zone: Phaser.GameObjects.Zone): void {
    this.obstacleColliders.set(
      zone,
      this.physics.add.overlap(this.player, zone, () => this.hitObstacle(zone)),
    );
  }

  private syncScore(): void {
    this.progress.score = this.scoreSystem.score;
    this.hud.update(this.progress);
  }

  private canLandOnPlatform(platform: Phaser.GameObjects.Zone): boolean {
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const platformBody = platform.body as Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody;
    const previousBottom = playerBody.prev.y + playerBody.height;
    return playerBody.velocity.y >= 0 && previousBottom <= platformBody.top + 6;
  }

  update(_time: number, delta: number): void {
    this.layerDebug?.update();
    // Edit mode owns the frame: returning here freezes the player, the
    // countdown and every gameplay check, and keeps arrow keys and space
    // from reaching the jump/duck handlers below.
    if (this.editorKey && Phaser.Input.Keyboard.JustDown(this.editorKey)) this.editor?.toggle();
    if (this.editor?.active) {
      this.editor.update();
      return;
    }
    if (this.debugKey && Phaser.Input.Keyboard.JustDown(this.debugKey))
      this.debugOverlay?.setVisible(!this.debugOverlay.visible);
    this.updateDebug();
    if (Phaser.Input.Keyboard.JustDown(this.space) || Phaser.Input.Keyboard.JustDown(this.keys.up))
      this.action();
    if (this.progress.state !== 'running') return;
    this.setDuck(this.duckKey.isDown || this.keys.down.isDown || this.touchDuckHeld);
    this.player.run(this.time.now);
    // The trains are built paused so they don't run past an idle player;
    // the first frame the player actually moves releases them.
    if (!this.trainsStarted && (this.player.body as Phaser.Physics.Arcade.Body).velocity.x > 0) {
      this.trainsStarted = true;
      this.world.startTrains();
    }
    if (import.meta.env.DEV) {
      const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
      if (playerBody.bottom > DESIGN_HEIGHT) {
        console.error('[BerlinScene] player body bottom exceeded DESIGN_HEIGHT', {
          bottom: playerBody.bottom,
          designHeight: DESIGN_HEIGHT,
        });
      }
    }
    if (this.pendingActivations.length) {
      this.pendingActivations = this.pendingActivations.filter((pending) => {
        if (this.player.x < pending.activationX) return true;
        pending.activate();
        return false;
      });
    }
    if (!this.finishTriggered && this.player.x >= CLUB_ENTRANCE_X) this.finish();
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
