import Phaser from 'phaser';
import { gameAudio } from '../audio/GameAudio';
import { queueSceneAudio } from '../audio/gameAudioCatalog';
import { bossSfxId } from '../audio/gameplaySfx';
import { AttackRenderer } from '../boss/AttackRenderer';
import { BossArena } from '../boss/BossArena';
import { BossFightDirector, type BossFightEvent } from '../boss/BossFightDirector';
import { BossHud } from '../boss/BossHud';
import { BossInput } from '../boss/BossInput';
import { BossPlayer } from '../boss/BossPlayer';
import { EmeraldLayer } from '../boss/EmeraldLayer';
import { getBossAssetUrls } from '../boss/bossAssets';
import { BOSS_ART } from '../boss/bossAssets';
import { BOSS_ARENA, BOSS_SCORING } from '../boss/bossConfig';
import { queueCharacterAssets, queueCharacterGameplay } from '../characters/characterAssets';
import { getSelectedCharacter } from '../characters/characterSelection';
import { footOffset } from '../characters/characterAnimation';
import { resolveCharacterRef, roleRef } from '../characters/characterRef';
import { stepAppearFrames } from '../dialogue/characterAppearAnimation';
import { BossRenderer } from '../boss/BossRenderer';
import { BossDepth, BossPalette } from '../boss/bossConstants';
import type { ArenaBounds } from '../boss/types';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import { getRuntimeAssetQualityProfile } from '../responsive/AssetQuality';
import { getLevel4AssetUrls, LEVEL4_ASSET_KEYS } from '../level/level4/level4Assets';
import type { RhythmResult } from '../rhythm/types';
import type { EditableScene, EditorSavePayload } from '../systems/editableSceneContract';
import { designPointFromLayout, layoutRatiosFromDesignPoint } from '../systems/designSpace';
import { createPlayerEditable, getPlayerVisualOffset } from '../systems/playerPresentation';
import type { EditableObject } from '../systems/SceneEditor';
import { launchCurrentSceneDialogue } from '../dialogue/currentSceneSnapshot';
import {
  liveSpriteActor,
  type CurrentSceneDialogueSource,
  type CurrentSceneLiveActor,
  type CurrentSceneLiveStage,
} from '../dialogue/currentSceneLiveStage';
import {
  BOSS_ENDING_DIALOGUE_RESUMED_EVENT,
  BOSS_ENDING_TIMING,
  buildBossEndingDialogue,
  buildBossResult,
} from '../boss/bossEnding';
import type { LevelCompleteSceneData } from './LevelCompleteScene';
import { prefetchNextLevel } from '../systems/campaignPrefetch';
import {
  buildSceneLayoutPayload,
  getSceneObjectLayout,
  setSceneObjectLayout,
} from '../systems/sceneLayout';
import { bossTelegraphWindowId } from '../boss/bossEmeraldWindows';

/** Editable id for the boss's own presentation. */
const BOSS_EDITABLE_ID = 'boss';
/** Editable id for Disus's presentation in the final dialogue only. */
const MAGICIAN_EDITABLE_ID = 'boss-final-magician';
/** Matches the opening metro dialogue's entrance pacing. */
const MAGICIAN_APPEAR_FRAME_MS = 90;

/** Upper bound on a single simulated frame, in milliseconds. */
const MAX_FRAME_DELTA_MS = 50;

export interface BossSceneData {
  /** Everything Levels 1 and 2 produced, passed straight through to the result. */
  rhythmResult: RhythmResult;
  /** Optional fixed seed; the fight is deterministic for a given seed. */
  seed?: number;
  /** Development route: stage the ending without waiting out the fight. */
  devEnding?: boolean;
}

type BossEndingPhase = 'charging' | 'projectile' | 'settled' | 'dialogue';

/**
 * Level 3: a boss dodge fight.
 *
 * The scene only wires things together — arena, boss visual, attack renderer,
 * player, input, HUD — and forwards frame ticks. Every rule (attack phases,
 * collision, scoring, fight structure) lives in `src/game/boss/` so it can be
 * tuned and tested without a running scene.
 */
export class BossScene extends Phaser.Scene implements EditableScene, CurrentSceneDialogueSource {
  private rhythmResult!: RhythmResult;
  private seed = 1;
  private director!: BossFightDirector;
  private arena!: BossArena;
  private boss!: BossRenderer;
  private attacks!: AttackRenderer;
  private player!: BossPlayer;
  private controls!: BossInput;
  private hud!: BossHud;
  private emeralds!: EmeraldLayer;
  /** Editor-only outline of the pickup box; never created outside the editor. */
  private pickupOutline?: Phaser.GameObjects.Graphics;
  /** Editor-only "EMERALDS: attack-XX" readout of the currently editable window. */
  private emeraldWindowLabel?: Phaser.GameObjects.Text;
  private bounds!: ArenaBounds;
  /** Canonical boss anchor before editor-authored presentation offsets. */
  private bossX = 0;
  private running = false;
  private finished = false;
  private introText?: Phaser.GameObjects.Text;
  private introPhase: 'playerFall' | 'bossSpawn' | 'instructions' = 'playerFall';
  /** Restored when the dev editor closes, so the fight resumes as it was. */
  private runningBeforeEditor = false;
  private endingPhase?: BossEndingPhase;
  private endingProjectile?: Phaser.GameObjects.Sprite;
  private bossResult?: RhythmResult;
  private devEnding = false;
  /**
   * Invisible editor anchor for Disus's final-dialogue presentation. Never
   * shown in normal gameplay — only its authored transform matters, read by
   * `buildCurrentSceneDialogueStage` when it builds the real dialogue clone.
   */
  private magicianAnchor?: Phaser.GameObjects.Sprite;

  constructor() {
    super('BossScene');
  }

  init(data: Partial<BossSceneData>): void {
    this.rhythmResult = data.rhythmResult ?? this.createEmptyResult();
    this.seed = data.seed ?? 1;
    this.devEnding = data.devEnding === true;
    this.running = false;
    this.finished = false;
    this.introPhase = 'playerFall';
    this.endingPhase = undefined;
    this.bossResult = undefined;
  }

  /** Lets the scene be launched standalone in dev without Levels 1 and 2. */
  private createEmptyResult(): RhythmResult {
    return {
      score: 0,
      rawScore: 0,
      maximumRawScore: 1,
      scorePenalty: 0,
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      good: 0,
      ok: 0,
      miss: 0,
      badTap: 0,
      berlinScore: 0,
      accuracy: 0,
      success: true,
    };
  }

  preload(): void {
    // Demand-driven and idempotent, so a direct ?scene=boss works even
    // though Berlin was never entered.
    queueCharacterGameplay(this, getSelectedCharacter());
    // Disus is a live actor only in the final dialogue, staged over this
    // scene's own captured frame; his entrance needs the same asset groups
    // the opening metro dialogue does.
    queueCharacterAssets(this, resolveCharacterRef(roleRef('magician')), ['appear', 'idle']);
    queueSceneAudio(this, 'BossScene');
    EmeraldLayer.queueAssets(this);
    const profile = getRuntimeAssetQualityProfile(this.game, this.scale);
    const background = getLevel4AssetUrls(profile).find(
      (asset) => asset.key === LEVEL4_ASSET_KEYS.holyworldBackground,
    );
    if (background && !this.textures.exists(background.key)) {
      this.load.image(background.key, background.url);
    }
    for (const asset of getBossAssetUrls(profile)) {
      if (!this.textures.exists(asset.key)) this.load.image(asset.key, asset.url);
    }
  }

  create(): void {
    gameAudio(this).startSceneMusic('BossScene');
    new OrientationController(this);
    attachFullscreenExitControl(this);
    this.cameras.main.setBackgroundColor(BossPalette.background);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    const { width } = this.cameras.main;
    this.bounds = BossArena.getBounds(width);
    this.bossX = width / 2;
    this.director = new BossFightDirector(this.bounds, this.seed);
    this.arena = new BossArena(this);
    this.arena.redraw();
    this.boss = new BossRenderer(this, width / 2);
    this.attacks = new AttackRenderer(this);
    this.player = new BossPlayer(this, width / 2, getSelectedCharacter());
    this.controls = new BossInput(this, this.game.device.input.touch);
    this.hud = new BossHud(this);
    this.emeralds = new EmeraldLayer(this, this.scene.key);
    this.emeralds.setBounds(this.bounds);
    this.magicianAnchor = this.buildMagicianAnchor();
    this.events.on(BOSS_ENDING_DIALOGUE_RESUMED_EVENT, this.showEndingChoices, this);

    this.applyAuthoredPresentation();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.showIntro();
    prefetchNextLevel('Boss', {
      profile: getRuntimeAssetQualityProfile(this.game, this.scale),
    });
  }

  // ------------------------------------------------------- EditableScene

  /**
   * Pushes the saved visual placement into the two renderers, which re-apply
   * it every frame. Both rewrite their own transform on each update — the boss
   * hovers, the player tracks its motion — so an editor that only moved the
   * display object would be overwritten immediately and lost on the next entry.
   */
  private applyAuthoredPresentation(): void {
    const boss = getSceneObjectLayout(this.scene.key, BOSS_EDITABLE_ID);
    // World-space offsets from each renderer's own anchor, resolved against
    // the canonical design box exactly as `getPlayerVisualOffset` does — the
    // boss entry is the same kind of value as the player's and must not
    // resolve differently.
    const offset = designPointFromLayout(boss, { x: 0, y: 0 });
    this.boss.setPresentation({
      offsetX: offset.x,
      offsetY: offset.y,
      scale: boss?.scale ?? 1,
    });
    this.player.setPresentation(getPlayerVisualOffset(this.scene.key));
  }

  /**
   * Builds Disus's invisible editor anchor: an absolute design-space point
   * (not a displacement from a gameplay anchor, since he doesn't move) that
   * only the final dialogue's `buildCurrentSceneDialogueStage` ever reads.
   */
  private buildMagicianAnchor(): Phaser.GameObjects.Sprite {
    const magician = resolveCharacterRef(roleRef('magician'));
    const idleFrame = magician.gameplay.idle!;
    const layout = getSceneObjectLayout(this.scene.key, MAGICIAN_EDITABLE_ID);
    const point = designPointFromLayout(layout, {
      x: this.cameras.main.width / 2,
      y: BOSS_ARENA.floorY,
    });
    return this.add
      .sprite(point.x, point.y, idleFrame.key)
      .setOrigin(0.5, 1)
      .setScale(layout?.scale ?? 1)
      .setFlipX(layout?.flipX === true)
      .setVisible(false);
  }

  /** Re-applies Disus's persisted transform after an editor change. */
  private applyMagicianPresentation(): void {
    const anchor = this.magicianAnchor;
    if (!anchor) return;
    const layout = getSceneObjectLayout(this.scene.key, MAGICIAN_EDITABLE_ID);
    const point = designPointFromLayout(layout, { x: anchor.x, y: anchor.y });
    anchor.setPosition(point.x, point.y).setScale(layout?.scale ?? 1).setFlipX(layout?.flipX === true);
  }

  /**
   * The two objects worth authoring: the boss and the playable character.
   *
   * Deliberately nothing else. Attacks and lasers are transient — the director
   * creates and destroys them per telegraph — so they are not authored
   * objects, and the arena is drawn from `bounds`, which the fight plan itself
   * was built from, so moving it would be a gameplay change rather than a
   * presentation one. Both entries here are presentation only: neither touches
   * `motion`, the arena bounds, collision or scoring.
   */
  getEditableObjects(): EditableObject[] {
    // Read live rather than captured: the boss hovers and the player's foot
    // gap changes with its frame, so a stale timestamp would bake a few
    // pixels of drift into every authored offset.
    return [
      {
        id: BOSS_EDITABLE_ID,
        label: 'BOSS',
        target: this.boss.displayObject,
        getNativeSize: () => {
          const bounds = this.boss.displayObject.getBounds();
          const scale = this.boss.displayObject.scaleX || 1;
          return { width: bounds.width / scale, height: bounds.height / scale };
        },
        onChange: (transform) => {
          const anchor = this.boss.anchorAt(this.time.now, this.bossX);
          setSceneObjectLayout(this.scene.key, BOSS_EDITABLE_ID, {
            ...layoutRatiosFromDesignPoint({
              x: transform.x - anchor.x,
              y: transform.y - anchor.y,
            }),
            scale: transform.scaleY / this.boss.baseScale,
          });
          this.applyAuthoredPresentation();
        },
      },
      createPlayerEditable(this, {
        sprite: this.player.displayObject,
        getAnchor: () =>
          this.player.anchorAt(this.time.now, this.player.currentFootGap(this.time.now)),
        getBaseScale: () => this.player.baseScaleAt(this.time.now),
        refresh: () => this.applyAuthoredPresentation(),
      }),
      // The arena's collectibles, laid out by hand the way Level 1's are.
      // Unlike the two above these are a set rather than a singleton, so they
      // are the only objects here that can be copied and deleted.
      ...this.emeralds.getEditableObjects(),
    ];
  }

  buildEditorSave(): EditorSavePayload[] {
    const payloads: EditorSavePayload[] = [{
      route: '/__scene-editor/save-layout',
      body: buildSceneLayoutPayload(this.scene.key),
    }];
    const emeraldWindow = this.emeralds.buildEditorSave();
    if (emeraldWindow) payloads.push(emeraldWindow);
    return payloads;
  }

  buildCurrentSceneDialogueStage(): CurrentSceneLiveStage {
    const editable = this.getEditableObjects();
    const boss = editable.find((object) => object.id === BOSS_EDITABLE_ID)!;
    const player = editable.find((object) => object.id === 'player')!;
    const camera = this.cameras.main;
    const bossActor: CurrentSceneLiveActor = {
      id: boss.id,
      label: boss.label ?? 'BOSS',
      source: boss,
      sourceScrollX: camera.scrollX,
      sourceScrollY: camera.scrollY,
      create: (scene) => {
        const clone = this.boss.createDialogueClone(scene);
        clone.setPosition(clone.x - camera.scrollX, clone.y - camera.scrollY);
        return clone;
      },
      update: (target, now) =>
        this.boss.updateDialogueClone(target as Phaser.GameObjects.Container, now),
    };

    const magicianActor = this.buildMagicianActor(camera);

    return {
      actors: [bossActor, liveSpriteActor(this, player), magicianActor.actor],
      buildEditorSave: () => this.buildEditorSave(),
      playArrival: (onComplete) => magicianActor.playArrival(onComplete),
    };
  }

  /**
   * Disus, live only for the final dialogue: hidden until `playArrival` runs
   * his appear frames (same ~90ms/frame pacing as the opening metro
   * dialogue), then settles on `gameplay/idle.png`. His transform is a real
   * `CurrentSceneLiveActor`, editable/persisted the same way the boss and
   * player are, via the invisible `magicianAnchor` created in `create()`.
   */
  private buildMagicianActor(camera: Phaser.Cameras.Scene2D.Camera): {
    actor: CurrentSceneLiveActor;
    playArrival: (onComplete: () => void) => void;
  } {
    const anchor = this.magicianAnchor!;
    const magician = resolveCharacterRef(roleRef('magician'));
    const appearFrames = magician.dialogue.appear;
    const idleFrame = magician.gameplay.idle!;
    // The floor line every frame's own foot gap is measured from, taken from
    // the anchor's authored (settled/idle) position, exactly as the metro
    // dialogue derives its own arrival floor from its settled pose.
    const floorY = anchor.y - footOffset(idleFrame.footGap, anchor.scaleY);
    const floorForFrame = (frame: typeof idleFrame): number =>
      floorY + footOffset(frame.footGap, anchor.scaleY);

    const source: EditableObject = {
      id: MAGICIAN_EDITABLE_ID,
      label: 'DISUS',
      target: anchor,
      resizable: true,
      getNativeSize: () => ({ width: anchor.frame.realWidth, height: anchor.frame.realHeight }),
      onChange: (transform) => {
        setSceneObjectLayout(this.scene.key, MAGICIAN_EDITABLE_ID, {
          ...layoutRatiosFromDesignPoint({ x: transform.x, y: transform.y }),
          scale: transform.scaleY,
          flipX: getSceneObjectLayout(this.scene.key, MAGICIAN_EDITABLE_ID)?.flipX === true,
        });
        this.applyMagicianPresentation();
      },
      flipHorizontal: () => {
        const current = getSceneObjectLayout(this.scene.key, MAGICIAN_EDITABLE_ID);
        setSceneObjectLayout(this.scene.key, MAGICIAN_EDITABLE_ID, {
          ...current,
          flipX: current?.flipX !== true,
        });
        this.applyMagicianPresentation();
      },
    };

    let sprite: Phaser.GameObjects.Sprite | undefined;
    const actor: CurrentSceneLiveActor = {
      id: MAGICIAN_EDITABLE_ID,
      label: 'DISUS',
      source,
      sourceScrollX: camera.scrollX,
      sourceScrollY: camera.scrollY,
      create: (scene) => {
        const startFrame = appearFrames[0];
        sprite = scene.add
          .sprite(
            anchor.x - camera.scrollX,
            floorForFrame(startFrame) - camera.scrollY,
            startFrame.key,
          )
          .setOrigin(0.5, 1)
          .setScale(anchor.scaleX, anchor.scaleY)
          .setFlipX(anchor.flipX)
          // Hidden until the line-gated entrance plays; never baked into the
          // captured snapshot, which is taken before this actor exists.
          .setVisible(false);
        return sprite;
      },
    };

    const playArrival = (onComplete: () => void): void => {
      if (!sprite) {
        onComplete();
        return;
      }
      const live = sprite;
      gameAudio(this).playSfx('disusAppearDisappear');
      live.setVisible(true);
      stepAppearFrames({
        frames: appearFrames,
        settledFrame: idleFrame,
        frameDurationMs: MAGICIAN_APPEAR_FRAME_MS,
        onShowFrame: (frame) => {
          live.setTexture(frame.key);
          live.setY(floorForFrame(frame) - camera.scrollY);
        },
        schedule: (delayMs, callback) => this.time.delayedCall(delayMs, callback),
        onComplete,
      });
    };

    return { actor, playArrival };
  }

  /**
   * Freezes the fight while the editor is open: the director stops advancing,
   * so the timer, the telegraphs and the live attacks all hold where they are
   * rather than killing a player who is standing still to be positioned.
   */
  onEditorEnable(): void {
    // Tweens, physics and the scene clock are frozen by the shared core. This
    // is the fight's own progression on top of that: the director stops
    // advancing, so the timer, the telegraphs and the live attacks hold.
    this.runningBeforeEditor = this.running;
    this.running = false;
    // Every spot, not just the offered ones: emeralds cannot be arranged
    // while the fight is hiding most of them.
    this.emeralds.setAuthoringVisible(true);
    // The pickup box is the one piece of this scene's geometry with no
    // artwork of its own, so spacing two emeralds by eye means guessing at it.
    // Created here rather than in `create`, so it exists only while editing —
    // and the editor itself is dev-only, so it cannot reach a shipped build.
    this.pickupOutline ??= this.add.graphics().setDepth(BossDepth.UI);
    // Which telegraph window `P save` will actually write is not otherwise
    // visible: the editor shows every spot at once regardless of window, so
    // without this a save can look like it landed somewhere it didn't.
    const windowId = this.emeralds.activeWindowId;
    this.emeraldWindowLabel ??= this.add
      .text(16, 16, '', { fontFamily: 'monospace', fontSize: '14px', color: '#56ffff' })
      .setDepth(BossDepth.UI)
      .setScrollFactor(0);
    this.emeraldWindowLabel.setText(windowId ? `EMERALDS: ${windowId}` : 'EMERALDS: (none active)');
  }

  onEditorDisable(): void {
    this.running = this.runningBeforeEditor;
    this.emeralds.setAuthoringVisible(false);
    this.pickupOutline?.destroy();
    this.pickupOutline = undefined;
    this.emeraldWindowLabel?.destroy();
    this.emeraldWindowLabel = undefined;
  }

  /** Outlines what an emerald is actually collected with, to scale. */
  private drawPickupOutline(): void {
    const outline = this.pickupOutline;
    if (!outline) return;
    const box = this.player.collectibleBox;
    outline
      .clear()
      .lineStyle(2, 0x56ffb0, 0.9)
      .strokeRect(
        box.centerX - box.halfWidth,
        box.centerY - box.halfHeight,
        box.halfWidth * 2,
        box.halfHeight * 2,
      );
  }

  private showIntro(): void {
    this.introPhase = 'playerFall';
    this.player.startEntrance(this.time.now);
  }

  private showFightInstructions(): void {
    const { width, height } = this.cameras.main;
    const hint = this.controls.isTouch ? 'HOLD LEFT OR RIGHT TO MOVE' : 'ARROWS OR A / D TO MOVE';
    this.introText = this.add
      .text(width / 2, height / 2 - 40, `DODGE THE BOSS\n\n${hint}\n\nSURVIVE THE FIGHT`, {
        fontFamily: 'Archivo Black',
        fontSize: '30px',
        color: '#ffdf57',
        align: 'center',
        stroke: '#55145e',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(2000);
    // Fixed delay rather than a keypress: the fight is on a timer, so everyone
    // gets the same read time before the first telegraph.
    this.time.delayedCall(1600, () => {
      this.introText?.destroy();
      this.introText = undefined;
      if (this.devEnding) this.endFight();
      else this.running = true;
    });
  }

  /**
   * Arena bounds are deliberately *not* recomputed here: the fight plan was
   * built from them, so resizing mid-fight must not move the lasers or the
   * walls the player is dodging between. Only the presentation reflows.
   */
  private handleResize(): void {
    this.arena.redraw();
    this.hud.reposition(this.cameras.main.width);
  }

  update(_time: number, delta: number): void {
    if (this.finished) return;
    const now = this.time.now;
    // A backgrounded tab can hand back a huge delta; letting it through would
    // teleport the fight clock past a whole telegraph.
    const step = Math.min(delta, MAX_FRAME_DELTA_MS);
    this.drawPickupOutline();
    if (this.endingPhase) {
      this.updateEnding(now);
      return;
    }
    if (!this.running) {
      // The previous level drops the player into this arena. The boss only
      // erupts after that landing, then the unchanged timed fight begins.
      this.player.update(0, 0, now, this.bounds);
      this.boss.update(now, this.bossX, this.player.damageHitbox.centerX, false);
      if (this.introPhase === 'playerFall' && this.player.isEntranceComplete(now)) {
        this.introPhase = 'bossSpawn';
        gameAudio(this).playSfx('bossIntro');
        this.boss.startSpawn(now);
      } else if (this.introPhase === 'bossSpawn' && this.boss.spawnComplete) {
        this.introPhase = 'instructions';
        this.showFightInstructions();
      }
      return;
    }

    const direction = this.controls.direction;
    this.player.update(step, direction, now, this.bounds);
    const playerHitbox = this.player.damageHitbox;

    this.collectEmeralds();

    const events = this.director.update(step, playerHitbox.centerX, playerHitbox.halfWidth);
    for (const event of events) this.handleFightEvent(event);

    const snapshot = this.director.snapshot;
    const charging = snapshot.activeAttacks.some((attack) => attack.phase === 'telegraph');
    this.boss.update(now, this.bossX, playerHitbox.centerX, charging);
    // The live sphere centre comes from the boss container after its movement,
    // authored editor offset and scale have all been applied this frame.
    this.attacks.redraw(
      snapshot.activeAttacks,
      snapshot.elapsedMs,
      this.boss.energySphereWorldCenter,
    );
    this.hud.update(snapshot);
  }

  private handleFightEvent(event: BossFightEvent): void {
    switch (event.kind) {
      case 'telegraphStarted':
        gameAudio(this).playSfx(bossSfxId(event.kind));
        // The windup is the only time emeralds are collectable, so they are
        // offered by the event that starts it rather than on a timer. The
        // group is anchored to the player's position right now, not to a
        // fixed world point.
        this.emeralds.showWindow(bossTelegraphWindowId(event.attack), this.player.damageHitbox.centerX);
        break;
      case 'attackActivated':
        gameAudio(this).playSfx(bossSfxId(event.kind));
        // The laser is live, but anything not already picked up stays
        // visible/collectable a beat longer before it's actually gone.
        this.emeralds.scheduleHide();
        this.boss.pulse();
        break;
      case 'playerHit':
        gameAudio(this).playSfx(bossSfxId(event.kind));
        this.player.onHit(this.time.now, event.beamCenterX);
        this.cameras.main.flash(120, 255, 71, 126).shake(180, 0.01);
        this.hud.flash(`-${BOSS_SCORING.hitPenalty}`, '#ff477e');
        break;
      case 'attackResolved':
        if (event.dodged && this.director.snapshot.score.combo >= 2) {
          this.hud.flash(`DODGE x${this.director.snapshot.score.combo}`, '#56ffff');
        }
        break;
      case 'phaseChanged':
        this.hud.flash(event.phase.label, '#ffdf57');
        break;
      case 'fightEnded':
        this.endFight();
        break;
      default:
        break;
    }
  }

  private collectEmeralds(): void {
    for (const emerald of this.emeralds.collect(this.player.collectibleBox)) {
      gameAudio(this).playSfx('token');
      this.director.collectEmerald();
      this.hud.popScore(emerald.x, emerald.y, BOSS_SCORING.emeraldScore);
    }
  }

  /**
   * The fight only ever ends by running out of clock, so there is no losing
   * branch here: the headline reports how cleanly it went, not whether it was
   * survived.
   */
  private endFight(): void {
    if (this.finished || this.endingPhase) return;
    this.running = false;
    this.emeralds.hideAll();
    const { score } = this.director.result;
    this.bossResult = buildBossResult(this.rhythmResult, score);
    this.endingPhase = 'charging';
    this.controls.destroy();
    this.time.delayedCall(BOSS_ENDING_TIMING.chargeMs, () => this.fireEndingProjectile());
  }

  private updateEnding(now: number): void {
    const playerX = this.player.damageHitbox.centerX;
    this.player.update(0, 0, now, this.bounds);
    this.boss.update(now, this.bossX, playerX, this.endingPhase === 'charging');
    const projectile = this.endingProjectile;
    if (projectile?.visible) {
      const frame = BOSS_ART.energySphere[Math.floor(now / 90) % BOSS_ART.energySphere.length];
      projectile.setTexture(frame.key);
    }
    this.attacks.redraw([], 0, this.boss.energySphereWorldCenter);
  }

  private fireEndingProjectile(): void {
    if (this.endingPhase !== 'charging') return;
    this.endingPhase = 'projectile';
    const origin = this.boss.energySphereWorldCenter;
    const target = {
      x: this.player.damageHitbox.centerX,
      y: this.player.displayObject.y - this.player.displayObject.displayHeight * 0.45,
    };
    this.endingProjectile = this.add
      .sprite(origin.x, origin.y, BOSS_ART.energySphere[0].key)
      .setDisplaySize(150, 150)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(BossDepth.LASER + 1);
    this.tweens.add({
      targets: this.endingProjectile,
      x: target.x,
      y: target.y,
      scaleX: 0.72,
      scaleY: 0.72,
      duration: BOSS_ENDING_TIMING.projectileMs,
      ease: 'Cubic.easeIn',
      onComplete: () => this.settleEndingKill(),
    });
  }

  private settleEndingKill(): void {
    if (this.endingPhase !== 'projectile') return;
    this.endingPhase = 'settled';
    this.endingProjectile?.destroy();
    this.endingProjectile = undefined;
    this.player.showDefeated(this.time.now);
    this.cameras.main.flash(180, 255, 255, 255).shake(140, 0.008);
    this.time.delayedCall(BOSS_ENDING_TIMING.settleMs, () => this.openFinalDialogue());
  }

  private openFinalDialogue(): void {
    if (this.endingPhase !== 'settled') return;
    this.endingPhase = 'dialogue';
    void launchCurrentSceneDialogue(this, {
      script: buildBossEndingDialogue(),
      resumeEvent: BOSS_ENDING_DIALOGUE_RESUMED_EVENT,
    }).catch((error: unknown) => {
      console.error('[BossScene] could not open final dialogue', error);
      this.showEndingChoices();
    });
  }

  private showEndingChoices(): void {
    if (this.finished || !this.bossResult) return;
    this.finished = true;
    const bossScore = this.bossResult.bossScore ?? 0;
    this.scene.start('LevelCompleteScene', {
      score: bossScore,
      maxScore: bossScore,
      retryScene: 'BossScene',
      retryData: { rhythmResult: this.rhythmResult, seed: this.seed },
      continueScene: 'ResultScene',
      continueData: { ...this.bossResult },
    } satisfies LevelCompleteSceneData);
  }

  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.controls?.destroy();
    this.endingProjectile?.destroy();
    this.endingProjectile = undefined;
    this.pickupOutline?.destroy();
    this.pickupOutline = undefined;
    this.emeralds?.destroy();
    this.player?.destroy();
    this.boss?.destroy();
    this.attacks?.destroy();
    this.arena?.destroy();
    this.time.removeAllEvents();
    this.events.off(BOSS_ENDING_DIALOGUE_RESUMED_EVENT, this.showEndingChoices, this);
  }
}
