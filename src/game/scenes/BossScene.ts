import Phaser from 'phaser';
import { AttackRenderer } from '../boss/AttackRenderer';
import { BossArena } from '../boss/BossArena';
import { BossFightDirector, type BossFightEvent } from '../boss/BossFightDirector';
import { BossHud } from '../boss/BossHud';
import { BossInput } from '../boss/BossInput';
import { BossPlayer } from '../boss/BossPlayer';
import { queueCharacterGameplay } from '../characters/characterAssets';
import { getSelectedCharacter } from '../characters/characterSelection';
import { BossRenderer } from '../boss/BossRenderer';
import { BossPalette } from '../boss/bossConstants';
import type { ArenaBounds } from '../boss/types';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import type { RhythmResult } from '../rhythm/types';
import type { EditorSavePayload } from '../systems/editableSceneContract';
import { designPointFromLayout, layoutRatiosFromDesignPoint } from '../systems/designSpace';
import { createPlayerEditable, getPlayerVisualOffset } from '../systems/playerPresentation';
import type { EditableObject } from '../systems/SceneEditor';
import { buildSceneLayoutPayload, getSceneObjectLayout, setSceneObjectLayout } from '../systems/sceneLayout';

/** Editable id for the boss's own presentation. */
const BOSS_EDITABLE_ID = 'boss';

/** Upper bound on a single simulated frame, in milliseconds. */
const MAX_FRAME_DELTA_MS = 50;

export interface BossSceneData {
  /** Everything Levels 1 and 2 produced, passed straight through to the result. */
  rhythmResult: RhythmResult;
  /** Optional fixed seed; the fight is deterministic for a given seed. */
  seed?: number;
}

/**
 * Level 3: a boss dodge fight.
 *
 * The scene only wires things together — arena, boss visual, attack renderer,
 * player, input, HUD — and forwards frame ticks. Every rule (attack phases,
 * collision, scoring, fight structure) lives in `src/game/boss/` so it can be
 * tuned and tested without a running scene.
 */
export class BossScene extends Phaser.Scene {
  private rhythmResult!: RhythmResult;
  private seed = 1;
  private director!: BossFightDirector;
  private arena!: BossArena;
  private boss!: BossRenderer;
  private attacks!: AttackRenderer;
  private player!: BossPlayer;
  private controls!: BossInput;
  private hud!: BossHud;
  private bounds!: ArenaBounds;
  /** Boss stays at the top centre; every laser is emitted from here. */
  private bossX = 0;
  private running = false;
  private finished = false;
  private introText?: Phaser.GameObjects.Text;
  /** Restored when the dev editor closes, so the fight resumes as it was. */
  private runningBeforeEditor = false;

  constructor() {
    super('BossScene');
  }

  init(data: Partial<BossSceneData>): void {
    this.rhythmResult = data.rhythmResult ?? this.createEmptyResult();
    this.seed = data.seed ?? 1;
    this.running = false;
    this.finished = false;
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
  }

  create(): void {
    new OrientationController(this);
    attachFullscreenExitControl(this);
    this.cameras.main.setBackgroundColor(BossPalette.background);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    const { width } = this.cameras.main;
    this.bounds = BossArena.getBounds(width);
    this.bossX = width / 2;
    this.director = new BossFightDirector(this.bounds, this.seed);
    this.arena = new BossArena(this);
    this.arena.redraw(this.bounds);
    this.boss = new BossRenderer(this, width / 2);
    this.attacks = new AttackRenderer(this);
    this.player = new BossPlayer(this, width / 2, getSelectedCharacter());
    this.controls = new BossInput(this, this.game.device.input.touch);
    this.hud = new BossHud(this);

    this.applyAuthoredPresentation();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.showIntro();
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
            scale: transform.scaleY,
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
    ];
  }

  buildEditorSave(): EditorSavePayload {
    return {
      route: '/__scene-editor/save-layout',
      body: buildSceneLayoutPayload(this.scene.key),
    };
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
  }

  onEditorDisable(): void {
    this.running = this.runningBeforeEditor;
  }

  private showIntro(): void {
    const { width, height } = this.cameras.main;
    const hint = this.controls.isTouch
      ? 'HOLD LEFT OR RIGHT TO MOVE'
      : 'ARROWS OR A / D TO MOVE';
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
    this.time.delayedCall(2600, () => {
      this.introText?.destroy();
      this.introText = undefined;
      this.running = true;
    });
  }

  /**
   * Arena bounds are deliberately *not* recomputed here: the fight plan was
   * built from them, so resizing mid-fight must not move the lasers or the
   * walls the player is dodging between. Only the presentation reflows.
   */
  private handleResize(): void {
    this.arena.redraw(this.bounds);
    this.hud.reposition(this.cameras.main.width);
  }

  update(_time: number, delta: number): void {
    if (this.finished) return;
    const now = this.time.now;
    // A backgrounded tab can hand back a huge delta; letting it through would
    // teleport the fight clock past a whole telegraph.
    const step = Math.min(delta, MAX_FRAME_DELTA_MS);
    if (!this.running) {
      // Still let the player idle and the boss hover during the intro.
      this.player.update(0, 0, now, this.bounds);
      this.boss.update(now, this.bossX, this.player.x);
      return;
    }

    const direction = this.controls.direction;
    this.player.update(step, direction, now, this.bounds);

    const events = this.director.update(step, this.player.x);
    for (const event of events) this.handleFightEvent(event);

    const snapshot = this.director.snapshot;
    // Lasers are drawn from the boss itself, so the renderer needs its X.
    this.attacks.redraw(snapshot.activeAttacks, snapshot.elapsedMs, this.bossX);
    this.boss.update(now, this.bossX, this.player.x);
    this.hud.update(snapshot);
  }

  private handleFightEvent(event: BossFightEvent): void {
    switch (event.kind) {
      case 'attackActivated':
        this.boss.pulse();
        break;
      case 'playerHit':
        this.player.onHit(this.time.now, event.beamCenterX);
        this.cameras.main.flash(120, 255, 71, 126).shake(180, 0.01);
        this.hud.flash('-500', '#ff477e');
        break;
      case 'attackResolved':
        if (event.dodged && this.director.snapshot.score.combo >= 2) {
          this.hud.flash(`DODGE x${this.director.snapshot.score.combo}`, '#56ffff');
        }
        break;
      case 'phaseChanged':
        this.boss.setPhaseTint(
          BossPalette.phaseTints[
            Math.min(BossPalette.phaseTints.length - 1, event.phase.index)
          ],
        );
        this.hud.flash(event.phase.label, '#ffdf57');
        break;
      case 'fightEnded':
        this.endFight(event.survived);
        break;
      default:
        break;
    }
  }

  private endFight(survived: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    const { score } = this.director.result;
    const { width, height } = this.cameras.main;
    const headline = survived
      ? score.hits === 0
        ? 'FLAWLESS'
        : 'YOU SURVIVED'
      : 'DOWNED';
    this.add
      .text(width / 2, height / 2 - 30, `${headline}\nBOSS SCORE  ${score.score}`, {
        fontFamily: 'Archivo Black',
        fontSize: '44px',
        color: survived ? '#ffdf57' : '#ff477e',
        align: 'center',
        stroke: '#55145e',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(2000);
    this.time.delayedCall(2200, () => {
      this.scene.start('ResultScene', {
        ...this.rhythmResult,
        bossScore: score.score,
        bossSurvived: survived,
        bossHits: score.hits,
        bossMaxCombo: score.maxCombo,
      });
    });
  }

  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.controls?.destroy();
    this.player?.destroy();
    this.boss?.destroy();
    this.attacks?.destroy();
    this.arena?.destroy();
    this.time.removeAllEvents();
  }
}
