import Phaser from 'phaser';
import {
  Depth,
  DESIGN_HEIGHT,
  GROUND_Y,
  START_TIME,
  WORLD_WIDTH,
} from '../constants';
import { Player } from '../entities/Player';
import {
  BERLIN_ENTITIES,
  BERLIN_SECTIONS,
  CLUB_ENTRANCE_X,
  GROUND_SEGMENTS,
} from '../level/berlin/berlinLevelConfig';
import { applyCollectibleReward } from '../level/berlin/berlinRules';
import { canAcceptTutorialJumpInput, resolveIntroStart } from '../level/berlin/controlsTutorial';
import {
  isCollectible,
  LevelBuilder,
  type BuiltBerlinLevel,
  type PendingActivation,
} from '../level/berlin/LevelBuilder';
import type { BerlinEntity, CollectibleConfig } from '../level/berlin/types';
import { buildBerlinWorld, type BuiltBerlinWorld } from '../level/berlinLevel';
import { createSceneLayers, type SceneLayers } from '../level/sceneLayers';
import {
  attachFullscreenExitControl,
  requestGameFullscreen,
} from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import { BerlinScoreSystem } from '../systems/BerlinScoreSystem';
import { ControlsTutorialSystem } from '../systems/ControlsTutorialSystem';
import { CullingSystem } from '../systems/CullingSystem';
import { HudSystem } from '../systems/HudSystem';
// Type-only: the implementations are dynamically imported below so the whole
// editor is dropped from a production bundle rather than shipped as dead code.
import type { LayerDebugSystem } from '../systems/LayerDebugSystem';
import type { LevelEditorSystem } from '../systems/LevelEditorSystem';
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
  /** Set while the orientation overlay holds the scene, and during teardown. */
  private inputSuspended = false;
  private shuttingDown = false;
  /** Set when the run starts on touch; consumed by the matching pointerup. */
  private startupFullscreenPending = false;
  private tutorialGatingTimer = false;
  private introHint?: Phaser.GameObjects.Text;
  /** Latest safe-area margin, kept so the start gate can re-anchor itself. */
  private safeMargin = 24;
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
  private culling!: CullingSystem;
  private tutorial!: ControlsTutorialSystem;
  private readonly scoreSystem = new BerlinScoreSystem();
  private readonly sections = new SectionTracker();
  private layerDebug?: LayerDebugSystem;
  private editor?: LevelEditorSystem;
  private editorKey?: Phaser.Input.Keyboard.Key;
  private debugOverlay?: Phaser.GameObjects.Container;
  private debugGraphics?: Phaser.GameObjects.Graphics;

  constructor() {
    super('BerlinScene');
  }

  create(): void {
    this.progress = { state: 'intro', seconds: START_TIME, score: 0, hasUsb: false };
    this.finishTriggered = false;
    this.trainsStarted = false;
    this.inputSuspended = false;
    this.shuttingDown = false;
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
    if (import.meta.env.DEV) console.debug('[BerlinScene] before LevelBuilder.build');
    this.levelBuilder = new LevelBuilder(this, this.layers.gameplay);
    this.level = this.levelBuilder.build();
    this.culling = new CullingSystem(this);
    this.culling.trackAll(this.level.entities);
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
    if (import.meta.env.DEV) console.debug('[BerlinScene] before HUD creation');
    this.hud = new HudSystem(
      this,
      () => this.touchJump(),
      (pressed) => this.touchDuck(pressed),
      this.layers.ui,
      () => this.completeStartupGesture(),
    );
    if (import.meta.env.DEV) console.debug('[BerlinScene] after HUD creation');
    this.hud.update(this.progress);
    this.tutorial = new ControlsTutorialSystem(
      this,
      BERLIN_ENTITIES,
      {
        setPlayerFrozen: (frozen) => this.player.setFrozen(frozen),
        setAirHold: (hold) => {
          if (hold) this.player.requestAirHold();
          else this.player.releaseAirHold();
        },
        resetPlayerPosition: (x) => this.player.setX(x),
        onComplete: () => {
          this.tutorialGatingTimer = false;
        },
      },
      this.layers.ui,
    );
    this.tutorialGatingTimer = this.tutorial.gatesTimer;
    this.createIntro();
    new OrientationController(this, {
      onPause: () => {
        // A touch-held duck can lose its pointerup while the device rotates
        // (finger position/target changes mid-gesture); force it to release
        // so input state is always clean when the overlay clears.
        this.inputSuspended = true;
        this.hud.releaseTouchCrouch();
        this.touchDuckHeld = false;
        this.setDuck(false);
        this.physics.pause();
      },
      onResume: () => {
        this.inputSuspended = false;
        this.physics.resume();
      },
      onLayout: (viewport) => {
        this.safeMargin = viewport.safeMargin;
        // Scale.EXPAND has already produced the new logical game width here.
        // Only the fixed sky grows; world objects and camera zoom stay fixed.
        this.world.resizeViewport(this.scale.gameSize.width);
        this.hud.applyLayout(viewport);
        this.tutorial.applyLayout(viewport);
        this.repositionOverlays();
      },
    });
    this.keys = this.input.keyboard!.createCursorKeys();
    this.space = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.duckKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.followPlayer();
    attachFullscreenExitControl(this);
    void this.createDevelopmentTools();
    // `once` so a restart cannot stack handlers; everything registered above
    // is released here rather than left attached to a dead scene.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
  }

  /**
   * The start gate: no panel, just a corner fullscreen button and a one-line
   * prompt. Both live in one container so starting the run removes them
   * together, leaving the guided tutorial overlay as the only thing on screen.
   */
  private createIntro(): void {
    const touch = this.game.device.input.touch;
    this.introHint = this.add
      .text(0, 0, touch ? 'TAP TO START' : 'PRESS SPACE TO START', {
        fontFamily: 'Space Mono',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#10091d',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 1);

    this.intro = this.add.container(0, 0, [this.introHint]).setScrollFactor(0).setDepth(Depth.UI);
    this.layers.ui.add(this.intro);
    this.layoutIntro();
  }

  /** Corner-anchored, so a rotation or resize keeps both readable. */
  private layoutIntro(): void {
    if (!this.intro?.active) return;
    const camera = this.cameras.main;
    const margin = this.safeMargin;
    this.introHint?.setPosition(camera.width / 2, camera.height - margin);
  }

  /**
   * The countdown hook. The run timer was removed from this game, so nothing
   * ticks behind this today; it is what a restored countdown would read, and
   * it stays true for the whole guided tutorial.
   */
  get runTimerGated(): boolean {
    return this.tutorialGatingTimer;
  }

  /**
   * Runs once, on the gesture that started the run. The jump has already been
   * requested on pointerdown, so this adds no second impulse.
   */
  private completeStartupGesture(): void {
    if (!this.startupFullscreenPending && this.game.device.input.touch) return;
    this.startupFullscreenPending = false;
    requestGameFullscreen(this);
  }

  private touchInputBlocked(): boolean {
    return (
      this.shuttingDown ||
      this.inputSuspended ||
      this.editor?.active === true ||
      this.progress.state === 'won'
    );
  }

  private touchJump(): boolean {
    if (this.touchInputBlocked()) return false;
    this.action();
    return true;
  }

  private touchDuck(pressed: boolean): boolean {
    if (!pressed) {
      this.touchDuckHeld = false;
      return true;
    }
    // During the intro only the jump zone may start the run.
    if (this.touchInputBlocked() || this.progress.state !== 'running') return false;
    this.touchDuckHeld = true;
    return true;
  }

  private action(): void {
    if (this.progress.state === 'running' && !this.player.canAcceptHitInput(this.time.now)) return;
    if (this.progress.state === 'intro') {
      this.progress.state = 'running';
      // Cue spacing is planned from where the run actually begins.
      this.tutorial.planFromStart(this.player.x);
      // Touch waits for the matching pointerup (browsers reject fullscreen
      // from an incomplete gesture); a key press is already a whole gesture.
      if (this.game.device.input.touch) this.startupFullscreenPending = true;
      else this.completeStartupGesture();
      // Removes the hint and the fullscreen button together.
      this.intro.destroy();
      this.introHint = undefined;
      this.hud.flash(BERLIN_SECTIONS[0].label, 900);
      // One buffered impulse, so the input that starts the run also jumps and
      // no second press is needed. The buffer is cleared on consumption, so it
      // can never spend both jumps.
      const start = resolveIntroStart(this.tutorial.state);
      if (start.jump) this.player.requestJump(this.time.now);
    } else if (this.progress.state === 'running') {
      if (!canAcceptTutorialJumpInput(this.tutorial.state)) return;
      this.player.requestJump(this.time.now);
    }
  }

  private setDuck(pressed: boolean): void {
    if (this.progress.state === 'running' && this.player.canAcceptHitInput(this.time.now))
      this.player.setCrouched(pressed);
  }

  private hitObstacle(zone: Phaser.GameObjects.Zone): void {
    if (this.invulnerable || this.progress.state !== 'running') return;
    // The duck prompt holds the player still; nothing may punish them there.
    if (this.tutorial.penaltiesSuspended) return;
    const config = zone.getData('config') as BerlinEntity;
    if (zone.getData('alreadyHit')) return;
    zone.setData('alreadyHit', true);
    if (import.meta.env.DEV) console.debug('OBSTACLE HIT', config.id);
    const body = zone.body as Phaser.Physics.Arcade.Body | undefined;
    if (body) body.enable = false;
    this.invulnerable = true;
    this.sections.markDamage();
    this.scoreSystem.hitObstacle();
    this.syncScore();
    this.hud.flash(`HIT ${config.id.toUpperCase()}\n-100`);
    this.player.hurt();
    this.player.startHitReaction(this.time.now);
    this.player.setTintFill(0xff3d66);
    this.cameras.main.flash(100, 255, 58, 92).shake(160, 0.008);
    this.time.delayedCall(1000, () => {
      this.invulnerable = false;
      this.player.clearTint();
    });
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
    this.time.delayedCall(2200, () => {
      this.scene.start('RhythmScene', { score: this.progress.score });
    });
  }

  private repositionOverlays(): void {
    this.layoutIntro();
  }

  private async createDevelopmentTools(): Promise<void> {
    // Guard inside the method, not at the call site: with DEV folded to false
    // the bundler drops everything below, so the editor chunks are never even
    // emitted for a production build.
    if (!import.meta.env.DEV) return;
    const [{ LayerDebugSystem }, { LevelEditorSystem }] = await Promise.all([
      import('../systems/LayerDebugSystem'),
      import('../systems/LevelEditorSystem'),
    ]);
    this.layerDebug = new LayerDebugSystem(this, this.layers);
    const layoutEditor = new LevelEditorSystem(this, this.level.entities, {
      // Platforms and collectibles join groups the colliders already watch;
      // an obstacle needs its own overlap, exactly as create() registers it.
      spawn: (config) => {
        const built = this.levelBuilder.addEntity(config);
        if (config.type === 'obstacle') this.watchObstacle(built.zone);
        this.culling.track(built);
        return built;
      },
      despawn: (zone) => {
        const collider = this.obstacleColliders.get(zone);
        if (collider) {
          this.physics.world.removeCollider(collider);
          this.obstacleColliders.delete(zone);
        }
        this.culling.release(zone);
        this.levelBuilder.removeEntity(zone);
      },
      releaseCamera: () => {
        // Panning the map must not leave objects hidden behind the cull test.
        this.culling.restoreAll();
        this.cameras.main.stopFollow();
      },
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

  /**
   * Releases only what Phaser does not.
   *
   * Registered from create(), so it runs *after* the systems that register at
   * scene boot: by this point ArcadePhysics.shutdown has already nulled
   * `physics.world`, TweenManager.shutdown has already called killAll, and
   * Clock.shutdown has already destroyed every timer. Repeating that work here
   * threw on the null world, and because SHUTDOWN runs inside
   * SceneManager.processQueue during game.step — which re-arms
   * requestAnimationFrame only after it returns — the throw stopped the loop
   * and the queued start of RhythmScene never ran.
   */
  private teardown(): void {
    this.shuttingDown = true;
    // Listeners on the *game* emitter outlive the scene, so these must go.
    this.hud.destroy();
    this.tutorial.destroy();
    this.editor?.destroy();
    this.culling.destroy();
    // The colliders themselves are gone with the world; just drop our handles.
    this.obstacleColliders.clear();
    this.pendingActivations.length = 0;
    this.editor = undefined;
    this.editorKey = undefined;
    this.debugKey = undefined;
    this.layerDebug = undefined;
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
    // Swept in place: filter() would allocate a fresh array every frame.
    for (let index = this.pendingActivations.length - 1; index >= 0; index -= 1) {
      const pending = this.pendingActivations[index];
      if (this.player.x < pending.activationX) continue;
      pending.activate();
      this.pendingActivations.splice(index, 1);
    }
    if (!this.finishTriggered && this.player.x >= CLUB_ENTRANCE_X) this.finish();
    const transition = this.sections.update(this.player.x);
    if (transition.changed) {
      if (transition.clean) this.scoreSystem.awardCleanSection();
      this.syncScore();
      this.hud.flash(`${transition.label}${transition.clean ? '\nCLEAN +250' : ''}`, 900);
    }
    this.hud.update(this.progress);
    this.tutorial.update(
      this.player.x,
      this.player.isCrouched(),
      this.player.didJumpThisFrame,
      this.player.jumpsThisAirtime,
      delta,
    );
    this.culling.update();
  }
}
